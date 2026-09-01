import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateEventDocumentFile, uploadEventDocumentBlob, isBlobConfigured } from '@/lib/eventDocumentUpload';

export const dynamic = 'force-dynamic';

async function resolveDocumentLeadId(doc: { leadId: number | null; eventId: number | null; discussionId: number | null }): Promise<number | null> {
  if (doc.leadId) return doc.leadId;
  if (doc.eventId) return (await prisma.event.findUnique({ where: { id: doc.eventId } }))?.leadId ?? null;
  if (doc.discussionId) return (await prisma.eventDiscussion.findUnique({ where: { id: doc.discussionId }, include: { event: true } }))?.event.leadId ?? null;
  return null;
}

// "Replace with a newer version" — appends a new EventDocumentVersion row
// rather than overwriting anything, so the full history stays fetchable.
// Generalized version of .../events/[eventId]/documents/[documentId]/versions
// that works for lead-level, event-attached, and discussion-attached
// documents alike (that route is left untouched for the per-event
// DocumentList view; this one backs the aggregated LeadDocumentsTab).
export async function POST(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const documentId = parseInt(params.documentId);
    const document = await prisma.eventDocument.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (!document) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    const leadId = await resolveDocumentLeadId(document);
    if (leadId !== parseInt(params.id)) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const nextVersion = (document.versions[0]?.versionNumber ?? 0) + 1;
    const blob = await uploadEventDocumentBlob(file, 'lead-documents');

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const [version, updatedDocument] = await prisma.$transaction([
      prisma.eventDocumentVersion.create({
        data: {
          eventDocumentId: documentId,
          versionNumber: nextVersion,
          fileUrl: blob.url,
          fileName: file.name,
          fileType: file.name.split('.').pop() || null,
          mimeType: file.type || null,
          fileSize: file.size,
          uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
        },
      }),
      prisma.eventDocument.update({
        where: { id: documentId },
        data: { fileName: file.name, mimeType: file.type || null },
      }),
    ]);

    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'DOCUMENT_REPLACED',
        description: `New version of "${file.name}" uploaded (v${nextVersion})`,
        performedById: Number.isFinite(uploadedById) ? uploadedById : null,
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'EVENT_DOCUMENT', entityId: documentId, newValue: version, description: `Version ${nextVersion} added to document "${file.name}"`, request });

    return NextResponse.json(updatedDocument, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/leads/[id]/documents/[documentId]/versions error:', error);
    return NextResponse.json({ message: error.message || 'Failed to upload new version' }, { status: 400 });
  }
}
