import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { putEncrypted } from '@/lib/storage';
import { isStorageConfigured, validateEventDocumentFile } from '@/lib/eventDocumentUpload';

export const dynamic = 'force-dynamic';

// Receipt/bill upload for the employee's own Reimbursement form — bare
// login check only (no manage_expenses-style permission), same "upload
// first, attach the returned URL on save" pattern as
// /api/expenses/upload and /api/payroll/employees/[id]/documents, just
// gated by requireAuth instead since this is the employee uploading their
// own receipt, not Finance recording a company expense.
//
// Stored the same way as My Space → My Documents (api/payroll/my-documents):
// whichever backend is configured (S3 and/or Vercel Blob, see
// src/lib/storage.ts), encrypted, under a random object key. Receipts are
// opened through GET /api/payroll/expense-claims/[id]/file, which decrypts
// server-side — the stored URL itself only ever returns ciphertext.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing S3_BUCKET_NAME and/or BLOB_READ_WRITE_TOKEN) — configure at least one storage backend to enable receipt uploads' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });

    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await putEncrypted('expense-claim-receipts', file);
    return NextResponse.json({ url: blob.url, name: file.name });
  } catch (error: any) {
    console.error('POST /api/payroll/expense-claims/upload error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 500 });
  }
}
