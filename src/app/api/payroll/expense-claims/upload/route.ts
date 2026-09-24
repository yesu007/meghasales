import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { isBlobConfigured, validateEventDocumentFile, uploadEventDocumentBlob } from '@/lib/eventDocumentUpload';

export const dynamic = 'force-dynamic';

// Receipt/bill upload for the employee's own Reimbursement form — bare
// login check only (no manage_expenses-style permission), same "upload
// first, attach the returned URL on save" pattern as
// /api/expenses/upload and /api/payroll/employees/[id]/documents, just
// gated by requireAuth instead since this is the employee uploading their
// own receipt, not Finance recording a company expense.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requireAuth();
  if (denied) return denied;

  if (!isBlobConfigured()) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable receipt uploads' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });

    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await uploadEventDocumentBlob(file, 'expense-claim-receipts');
    return NextResponse.json({ url: blob.url, name: file.name });
  } catch (error: any) {
    console.error('POST /api/payroll/expense-claims/upload error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 500 });
  }
}
