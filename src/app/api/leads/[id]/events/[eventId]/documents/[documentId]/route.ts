import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { documentId: string } }) {
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
    return NextResponse.json(document);
  } catch (error) {
    console.error('GET .../documents/[documentId] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// No physical Blob deletion here — matches the accounting module's
// existing precedent of never calling Blob's del(); orphaned blobs are an
// acceptable, low-cost tradeoff already implicit elsewhere in the codebase.
export async function DELETE(request: NextRequest, { params }: { params: { documentId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;

  try {
    const id = parseInt(params.documentId);
    const existing = await prisma.eventDocument.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    await prisma.eventDocument.delete({ where: { id } });

    const leadId = existing.eventId
      ? (await prisma.event.findUnique({ where: { id: existing.eventId } }))?.leadId
      : (await prisma.eventDiscussion.findUnique({ where: { id: existing.discussionId! }, include: { event: true } }))?.event.leadId;

    if (leadId) {
      await prisma.leadActivity.create({
        data: {
          leadId,
          activityType: 'DOCUMENT_DELETED',
          description: `Document "${existing.fileName}" deleted`,
        },
      });
    }

    await logAudit({ action: 'DELETE', entityType: 'EVENT_DOCUMENT', entityId: id, oldValue: existing, description: `Document "${existing.fileName}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE .../documents/[documentId] error:', error);
    return NextResponse.json({ message: 'Failed to delete document' }, { status: 400 });
  }
}
