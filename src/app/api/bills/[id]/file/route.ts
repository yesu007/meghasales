import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { serveStoredDocument } from '@/lib/documentDownload';

export const dynamic = 'force-dynamic';

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
};

// View/download a bill's attached invoice PDF, decrypted server-side.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_expenses');
  if (denied) return denied;

  const bill = await prisma.bill.findFirst({ where: { id: parseInt(params.id, 10), deletedAt: null }, select: { attachmentUrl: true, attachmentName: true, paymentProofUrl: true, paymentProofName: true } });

  // ?type=payment-proof serves the Payment popup's attachment instead of the
  // invoice PDF. Any file type (receipt image, PDF…), so the type comes from
  // its own file name.
  if (new URL(request.url).searchParams.get('type') === 'payment-proof') {
    if (!bill?.paymentProofUrl) return NextResponse.json({ message: 'Payment proof not found' }, { status: 404 });
    const fileName = bill.paymentProofName || 'payment-proof';
    return serveStoredDocument(request, { url: bill.paymentProofUrl, fileName, mimeType: MIME_BY_EXTENSION[fileName.split('.').pop()?.toLowerCase() || ''] || null });
  }

  if (!bill?.attachmentUrl) return NextResponse.json({ message: 'Invoice PDF not found' }, { status: 404 });
  return serveStoredDocument(request, { url: bill.attachmentUrl, fileName: bill.attachmentName || 'invoice.pdf', mimeType: 'application/pdf' });
}
