import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkPermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { serveStoredDocument } from '@/lib/documentDownload';

export const dynamic = 'force-dynamic';

// ExpenseClaim has no mimeType column — derived from the receipt's own file
// name (the upload route only accepts these types anyway, see
// validateEventDocumentFile); anything else downloads as an attachment.
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

// View/download a Reimbursement's receipt, decrypted server-side — same
// shape as My Space → My Documents' own file route. Allowed for the
// employee who filed the claim, or an approver (approve_expense_claims,
// the same permission as the Reimbursements approval page).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const session = await getServerSession(authOptions);
  const userId = session?.user ? parseInt((session.user as any).id, 10) : NaN;
  if (!Number.isFinite(userId)) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const id = parseInt(params.id, 10);
  if (!id) return NextResponse.json({ message: 'Invalid reimbursement' }, { status: 400 });

  // ?type=payment-proof serves the approver's payment proof (Mark Paid
  // popup) instead of the employee's receipt — same access rules.
  const wantsProof = new URL(request.url).searchParams.get('type') === 'payment-proof';
  const claim = await prisma.expenseClaim.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
  const fileUrl = wantsProof ? claim?.paymentProofUrl : claim?.attachmentUrl;
  if (!claim || !fileUrl) return NextResponse.json({ message: 'Receipt not found' }, { status: 404 });

  const isOwner = claim.employee.userId === userId;
  if (!isOwner && !checkPermission(session, 'approve_expense_claims')) {
    return NextResponse.json({ message: 'Receipt not found' }, { status: 404 });
  }

  const fileName = (wantsProof ? claim.paymentProofName : claim.attachmentName) || (wantsProof ? 'payment-proof' : 'receipt');
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  return serveStoredDocument(request, { url: fileUrl, fileName, mimeType: MIME_BY_EXTENSION[extension] || null });
}
