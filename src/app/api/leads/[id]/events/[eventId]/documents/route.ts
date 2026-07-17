import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateEventDocumentFile, uploadEventDocumentBlob } from '@/lib/eventDocumentUpload';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  try {
    const eventId = parseInt(params.eventId);
    const documents = await prisma.eventDocument.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        uploadedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { versions: true } },
      },
    });
    return NextResponse.json(documents);
  } catch (error) {
    console.error('GET .../documents error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Also handles discussion attachments — pass `discussionId` in the form
// data instead of relying on the eventId in the URL, so this single
// endpoint/versioning machinery serves both cases without duplication.
export async function POST(request: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const eventId = parseInt(params.eventId);
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.leadId !== parseInt(params.id)) {
      return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const description = (formData.get('description') as string) || null;
    const discussionIdRaw = formData.get('discussionId') as string | null;

    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    let discussionId: number | null = null;
    if (discussionIdRaw) {
      discussionId = parseInt(discussionIdRaw);
      const discussion = await prisma.eventDiscussion.findUnique({ where: { id: discussionId } });
      if (!discussion || discussion.eventId !== eventId) {
        return NextResponse.json({ message: 'Discussion not found' }, { status: 404 });
      }
    }

    const blob = await uploadEventDocumentBlob(file, 'event-documents');

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.eventDocument.create({
        data: {
          eventId: discussionId ? null : eventId,
          discussionId,
          fileName: file.name,
          description,
          mimeType: file.type || null,
          uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
        },
      });
      await tx.eventDocumentVersion.create({
        data: {
          eventDocumentId: doc.id,
          versionNumber: 1,
          fileUrl: blob.url,
          fileName: file.name,
          fileType: file.name.split('.').pop() || null,
          mimeType: file.type || null,
          fileSize: file.size,
          uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
        },
      });
      return doc;
    });

    await prisma.leadActivity.create({
      data: {
        leadId: event.leadId,
        activityType: 'DOCUMENT_UPLOADED',
        description: `Document "${file.name}" uploaded`,
        performedById: Number.isFinite(uploadedById) ? uploadedById : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'EVENT_DOCUMENT', entityId: document.id, newValue: document, description: `Document "${file.name}" uploaded`, request });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('POST .../documents error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
