import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// No physical Blob deletion here — matches the Lead document route's
// existing precedent of never calling Blob's del(); orphaned blobs are an
// acceptable, low-cost tradeoff already implicit elsewhere in the codebase.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; entityId: string; documentId: string } }) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;

  try {
    const entityId = parseInt(params.entityId);
    const id = parseInt(params.documentId);
    const existing = await prisma.eventDocument.findUnique({ where: { id } });
    if (!existing || existing.legalEntityId !== entityId) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

    await prisma.eventDocument.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'EVENT_DOCUMENT', entityId: id, oldValue: existing, description: `Document "${existing.fileName}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE .../legal-entities/[entityId]/documents/[documentId] error:', error);
    return NextResponse.json({ message: 'Failed to delete document' }, { status: 400 });
  }
}
