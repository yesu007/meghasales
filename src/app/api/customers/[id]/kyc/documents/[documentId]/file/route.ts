import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { serveStoredDocument } from '@/lib/documentDownload';

export const dynamic = 'force-dynamic';

// View/download a Customer KYC document, decrypted server-side. Same
// view_leads gate as GET /api/customers/[id]/kyc; the document must belong
// to this customer's KYC record.
export async function GET(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  const leadId = parseInt(params.id, 10);
  const documentId = parseInt(params.documentId, 10);
  if (!leadId || !documentId) return NextResponse.json({ message: 'Invalid document' }, { status: 400 });

  const doc = await prisma.customerKycDocument.findFirst({ where: { id: documentId, kyc: { leadId } } });
  if (!doc) return NextResponse.json({ message: 'Document not found' }, { status: 404 });

  return serveStoredDocument(request, { url: doc.fileUrl, fileName: doc.fileName, mimeType: doc.mimeType });
}
