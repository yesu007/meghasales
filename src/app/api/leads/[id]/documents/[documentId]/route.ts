import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// A document's owning lead can come from any of three places: directly
// (leadId), via its event, or via its discussion's event. Centralized here
// since both GET and DELETE need it, and the versions route needs the same
// logic.
async function resolveDocumentLeadId(doc: { leadId: number | null; eventId: number | null; discussionId: number | null }): Promise<number | null> {
  if (doc.leadId) return doc.leadId;
  if (doc.eventId) return (await prisma.event.findUnique({ where: { id: doc.eventId } }))?.leadId ?? null;
  if (doc.discussionId) return (await prisma.eventDiscussion.findUnique({ where: { id: doc.discussionId }, include: { event: true } }))?.event.leadId ?? null;
  return null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  try {
    const document = await prisma.eventDocument.findUnique({
      where: { id: parseInt(params.documentId) },
      include: {
        versions: { orderBy: { versionNumber: 'asc' }, include: { uploadedBy: { select: { firstName: true, lastName: true } } } },
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!document) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    const leadId = await resolveDocumentLeadId(document);
    if (leadId !== parseInt(params.id)) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    return NextResponse.json(document);
  } catch (error) {
    console.error('GET /api/leads/[id]/documents/[documentId] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// No physical Blob deletion here — matches the accounting module's
// existing precedent of never calling Blob's del(); orphaned blobs are an
// acceptable, low-cost tradeoff already implicit elsewhere in the codebase.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;

  try {
    const id = parseInt(params.documentId);
    const existing = await prisma.eventDocument.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    const leadId = await resolveDocumentLeadId(existing);
    if (leadId !== parseInt(params.id)) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    await prisma.eventDocument.delete({ where: { id } });

    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'DOCUMENT_DELETED',
        description: `Document "${existing.fileName}" deleted`,
      },
    });

    await logAudit({ action: 'DELETE', entityType: 'EVENT_DOCUMENT', entityId: id, oldValue: existing, description: `Document "${existing.fileName}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/leads/[id]/documents/[documentId] error:', error);
    return NextResponse.json({ message: 'Failed to delete document' }, { status: 400 });
  }
}
