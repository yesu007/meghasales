import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';

export const dynamic = 'force-dynamic';

// Same 10MB cap as the other attachment upload paths in this app
// (admin-ticket attachments, event documents, payment proof) — covers a
// document or a voice-note recording alike, no separate mime allowlist
// (same as admin-ticket's attachments route) so audio blobs upload the
// same way a PDF does.
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// MeetingAttachment is polymorphic (entityType/entityId) with no Prisma
// relation to Mom by design (see the schema's module-header comment) — so
// unlike AdminTicketAttachment this is always a manual query, not an
// `include`.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_meetings');
  if (denied) return denied;

  try {
    const momId = parseInt(params.id);
    const attachments = await prisma.meetingAttachment.findMany({
      where: { entityType: 'MOM', entityId: momId },
      orderBy: { createdAt: 'desc' },
    });

    const userIds = Array.from(new Set(attachments.map((a) => a.uploadedById).filter((v): v is number => v != null)));
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
    const userName = (uid: number | null) => {
      if (uid == null) return null;
      const u = users.find((x) => x.id === uid);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    return NextResponse.json(attachments.map((a) => ({ ...a, uploadedByName: userName(a.uploadedById) })));
  } catch (error) {
    console.error('GET /api/mom/[id]/attachments error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_mom');
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const momId = parseInt(params.id);
    const mom = await prisma.mom.findUnique({ where: { id: momId }, select: { id: true, meetingId: true } });
    if (!mom) return NextResponse.json({ message: 'MOM not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    if (file.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json({ message: 'File exceeds the 10MB limit' }, { status: 400 });
    }

    const blob = await put(`mom-attachments/${Date.now()}-${file.name}`, file, { access: 'public' });

    const session = await getServerSession(authOptions);
    const uploadedById = currentUserId(session);

    const attachment = await prisma.meetingAttachment.create({
      data: {
        entityType: 'MOM',
        entityId: momId,
        fileName: file.name,
        filePath: blob.url,
        mimeType: file.type || null,
        size: file.size,
        uploadedById,
      },
    });

    await prisma.meetingActivity.create({
      data: { meetingId: mom.meetingId, action: 'MOM_ATTACHMENT_ADDED', remarks: file.name, performedById: uploadedById },
    });

    await logAudit({ action: 'CREATE', entityType: 'MEETING_ATTACHMENT', entityId: attachment.id, newValue: attachment, description: `Attachment "${file.name}" added to MOM ${momId}`, request });

    return NextResponse.json({ ...attachment, uploadedByName: null }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/mom/[id]/attachments error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
