import { NextRequest, NextResponse } from 'next/server';
import { put, isStorageConfigured } from '@/lib/storage';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Receipt uploads for the Expenses form — same shape as
// src/app/api/accounting/upload/route.ts (Payment's attachment upload),
// gated by manage_expenses instead and its own blob path prefix so the
// two attachment sets don't intermingle.
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

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) return NextResponse.json({ message: 'File exceeds the 10MB limit' }, { status: 400 });

    const blob = await put(`expense-attachments/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    return NextResponse.json({ url: blob.url, name: file.name });
  } catch (error: any) {
    console.error('POST /api/expenses/upload error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 500 });
  }
}
