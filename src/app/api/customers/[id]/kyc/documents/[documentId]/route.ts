import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateCustomerDocumentFile, uploadCustomerDocumentBlob, fileExtension } from '@/lib/customerDocumentUpload';

export const dynamic = 'force-dynamic';

// Replace an uploaded KYC document in place (updates the file fields on
// the same row — no version-history child table, same tradeoff Lead
// Events' own DELETE already accepts: the previous Blob object is left
// orphaned rather than reclaimed).
export async function PUT(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const leadId = parseInt(params.id);
    const documentId = parseInt(params.documentId);

    const existing = await prisma.customerKycDocument.findUnique({ where: { id: documentId }, include: { kyc: true } });
    if (!existing || existing.kyc.leadId !== leadId) {
      return NextResponse.json({ message: 'KYC document not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    const validationError = validateCustomerDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await uploadCustomerDocumentBlob(file, 'customer-kyc');

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const document = await prisma.customerKycDocument.update({
      where: { id: documentId },
      data: {
        fileName: file.name,
        fileType: fileExtension(file.name) || null,
        mimeType: file.type || null,
        fileUrl: blob.url,
        fileSize: file.size,
        uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
        uploadedAt: new Date(),
      },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });

    await logAudit({ action: 'UPDATE', entityType: 'CUSTOMER_KYC_DOCUMENT', entityId: document.id, oldValue: existing, newValue: document, description: `KYC document replaced: ${file.name}`, request });

    return NextResponse.json(document);
  } catch (error: any) {
    console.error('PUT /api/customers/[id]/kyc/documents/[documentId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to replace document' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; documentId: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const documentId = parseInt(params.documentId);

    const existing = await prisma.customerKycDocument.findUnique({ where: { id: documentId }, include: { kyc: true } });
    if (!existing || existing.kyc.leadId !== leadId) {
      return NextResponse.json({ message: 'KYC document not found' }, { status: 404 });
    }

    await prisma.customerKycDocument.delete({ where: { id: documentId } });
    await logAudit({ action: 'DELETE', entityType: 'CUSTOMER_KYC_DOCUMENT', entityId: documentId, oldValue: existing, description: `KYC document deleted: ${existing.fileName}`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/customers/[id]/kyc/documents/[documentId] error:', error);
    return NextResponse.json({ message: 'Failed to delete document' }, { status: 400 });
  }
}
