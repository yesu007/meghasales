import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Payment receipt/proof-of-payment uploads for the Payment Entry screen.
// Requires a Vercel Blob store provisioned on the project and a
// BLOB_READ_WRITE_TOKEN env var — without it this returns a clear 503
// rather than a confusing generic failure, since attachments are optional
// and the rest of Payment Entry should stay usable either way.
export async function POST(request: NextRequest) {
  const denied = await requirePermission('manage_payments');
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) return NextResponse.json({ message: 'File exceeds the 10MB limit' }, { status: 400 });

    const blob = await put(`payment-attachments/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    return NextResponse.json({ url: blob.url, name: file.name });
  } catch (error: any) {
    console.error('POST /api/accounting/upload error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 500 });
  }
}
