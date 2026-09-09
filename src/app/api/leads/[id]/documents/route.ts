import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateEventDocumentFile, uploadEventDocumentBlob, isBlobConfigured } from '@/lib/eventDocumentUpload';

export const dynamic = 'force-dynamic';

// Aggregated view of every document uploaded on a lead — both genuine
// lead-level documents (leadId set, no event required) and documents
// attached to one of the lead's events. Discussion attachments
// (EventDocument.eventId AND leadId both null) are intentionally excluded
// here since they're scoped to a single discussion thread, not the lead
// broadly; they remain visible inline within DiscussionTimeline.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const documents = await prisma.eventDocument.findMany({
      where: { OR: [{ event: { leadId } }, { leadId }] },
      orderBy: { createdAt: 'desc' },
      include: {
        event: { select: { id: true, title: true } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        uploadedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { versions: true } },
      },
    });
    return NextResponse.json(documents);
  } catch (error) {
    console.error('GET /api/leads/[id]/documents error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Upload a document straight to the lead, no Event required — for
// paperwork that isn't tied to any specific meeting/call/visit.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const leadId = parseInt(params.id);
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const description = (formData.get('description') as string) || null;

    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await uploadEventDocumentBlob(file, 'lead-documents');

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.eventDocument.create({
        data: {
          leadId,
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
        leadId,
        activityType: 'DOCUMENT_UPLOADED',
        description: `Document "${file.name}" uploaded`,
        performedById: Number.isFinite(uploadedById) ? uploadedById : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'EVENT_DOCUMENT', entityId: document.id, newValue: document, description: `Document "${file.name}" uploaded for ${lead.companyName}`, request });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/leads/[id]/documents error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
