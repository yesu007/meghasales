import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateCustomerDocumentFile, uploadCustomerDocumentBlob, fileExtension } from '@/lib/customerDocumentUpload';

export const dynamic = 'force-dynamic';

// Upload a KYC document — works even before the KYC text fields have been
// saved (auto-creates a minimal parent CustomerKyc row on first upload),
// so document upload and the "Save KYC" form action are independent.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
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
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    const validationError = validateCustomerDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await uploadCustomerDocumentBlob(file, 'customer-kyc');

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const kyc = await prisma.customerKyc.upsert({
      where: { leadId },
      create: { leadId },
      update: {},
    });

    const document = await prisma.customerKycDocument.create({
      data: {
        kycId: kyc.id,
        fileName: file.name,
        fileType: fileExtension(file.name) || null,
        mimeType: file.type || null,
        fileUrl: blob.url,
        fileSize: file.size,
        uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
      },
      include: { uploadedBy: { select: { firstName: true, lastName: true } } },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'CUSTOMER_KYC_DOCUMENT_UPLOADED',
        description: `KYC document "${file.name}" uploaded for ${lead.companyName}`,
        performedById: Number.isFinite(uploadedById) ? uploadedById : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'CUSTOMER_KYC_DOCUMENT', entityId: document.id, newValue: document, description: `KYC document uploaded: ${file.name}`, request });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/customers/[id]/kyc/documents error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
