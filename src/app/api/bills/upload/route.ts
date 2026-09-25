import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/rbac';
import { isStorageConfigured, putEncrypted } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

// Invoice PDF upload for the Bill form — "upload first, attach the returned
// URL on save", same as /api/expenses/upload. Stored encrypted under a
// random key like Reimbursement receipts; opened through
// GET /api/bills/[id]/file, which decrypts server-side. The PDF is kept for
// reference only — bill details are keyed in manually.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_expenses');
  if (denied) return denied;
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing S3_BUCKET_NAME and/or BLOB_READ_WRITE_TOKEN) — configure at least one storage backend to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    // ?kind=payment-proof: the Payment popup's receipt — a PDF or an image
    // (photo / screenshot of the transfer). Invoices stay PDF-only.
    const isPaymentProof = new URL(request.url).searchParams.get('kind') === 'payment-proof';
    const name = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /.(png|jpe?g|gif|webp)$/.test(name);
    if (isPaymentProof ? !(isPdf || isImage) : !isPdf) {
      return NextResponse.json({ message: isPaymentProof ? 'Attach a PDF or an image (PNG, JPG, GIF, WEBP)' : 'Only PDF invoices can be attached' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) return NextResponse.json({ message: 'File exceeds the 10MB limit' }, { status: 400 });

    const blob = await putEncrypted(isPaymentProof ? 'bill-payment-proofs' : 'bill-invoices', file);
    return NextResponse.json({ url: blob.url, name: file.name });
  } catch (error: any) {
    console.error('POST /api/bills/upload error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 500 });
  }
}
