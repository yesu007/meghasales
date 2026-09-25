import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { serveStoredDocument } from '@/lib/documentDownload';

export const dynamic = 'force-dynamic';

// View/download one version of a Lead document — lead-level, Lead Event,
// or Event discussion attachment (all EventDocument rows the Lead's
// Documents tab already lists) — decrypted server-side. Same
// view_lead_events gate as the list endpoints; the version must belong to
// this document and the document to this lead, so ids can't be mixed to
// reach another lead's file. Company legal entity documents share the
// EventDocument table but are never reachable here (no lead link).
export async function GET(request: NextRequest, { params }: { params: { id: string; documentId: string; versionId: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  const leadId = parseInt(params.id, 10);
  const documentId = parseInt(params.documentId, 10);
  const versionId = parseInt(params.versionId, 10);
  if (!leadId || !documentId || !versionId) return NextResponse.json({ message: 'Invalid document' }, { status: 400 });

  const version = await prisma.eventDocumentVersion.findFirst({
    where: {
      id: versionId,
      eventDocumentId: documentId,
      eventDocument: { OR: [{ leadId }, { event: { leadId } }, { discussion: { event: { leadId } } }] },
    },
  });
  if (!version) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

  return serveStoredDocument(request, { url: version.fileUrl, fileName: version.fileName, mimeType: version.mimeType });
}
