import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateCustomerDocumentFile, uploadCustomerDocumentBlob, fileExtension } from '@/lib/customerDocumentUpload';

export const dynamic = 'force-dynamic';

const CONTRACT_TYPES = ['NDA', 'MSA', 'SOW', 'COMMERCIAL_AGREEMENT', 'OTHER'];
const CONTRACT_STATUSES = ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'TERMINATED'];

export async function GET(request: NextRequest, { params }: { params: { id: string; contractId: string } }) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const contractId = parseInt(params.contractId);
    const contract = await prisma.customerContract.findUnique({
      where: { id: contractId },
      include: { implementation: { select: { id: true, projectName: true } }, uploadedBy: { select: { firstName: true, lastName: true } } },
    });
    if (!contract || contract.leadId !== leadId) return NextResponse.json({ message: 'Contract not found' }, { status: 404 });
    return NextResponse.json(contract);
  } catch (error) {
    console.error('GET /api/customers/[id]/contracts/[contractId] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Edit contract fields. Accepts multipart/form-data — a `file` field
// replaces the attached document in place; `removeFile=true` (no file)
// clears the attached document without deleting the whole contract
// record (the two separate actions the requirement calls "replace" and
// "remove" for the attached document).
export async function PUT(request: NextRequest, { params }: { params: { id: string; contractId: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const contractId = parseInt(params.contractId);

    const existing = await prisma.customerContract.findUnique({ where: { id: contractId } });
    if (!existing || existing.leadId !== leadId) return NextResponse.json({ message: 'Contract not found' }, { status: 404 });

    const formData = await request.formData();
    const contractType = formData.get('contractType') as string | null;
    const projectName = formData.get('projectName') as string | null;
    const implementationIdRaw = formData.get('implementationId') as string | null;
    const contractDate = formData.get('contractDate') as string | null;
    const expiryDate = formData.get('expiryDate') as string | null;
    const status = formData.get('status') as string | null;
    const file = formData.get('file') as File | null;
    const removeFile = formData.get('removeFile') === 'true';

    if (contractType && !CONTRACT_TYPES.includes(contractType)) {
      return NextResponse.json({ message: 'Invalid contract type' }, { status: 400 });
    }
    if (contractDate && isNaN(Date.parse(contractDate))) {
      return NextResponse.json({ message: 'Invalid Date' }, { status: 400 });
    }
    if (expiryDate && isNaN(Date.parse(expiryDate))) {
      return NextResponse.json({ message: 'Invalid Expiry/Renewal Date' }, { status: 400 });
    }
    if (status && !CONTRACT_STATUSES.includes(status)) {
      return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    let fileFields: Record<string, any> = {};
    if (file) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
          { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
          { status: 503 }
        );
      }
      const validationError = validateCustomerDocumentFile(file);
      if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });
      const blob = await uploadCustomerDocumentBlob(file, 'customer-contracts');
      fileFields = {
        fileName: file.name,
        fileType: fileExtension(file.name) || null,
        mimeType: file.type || null,
        fileUrl: blob.url,
        fileSize: file.size,
        uploadedById: Number.isFinite(performedById) ? performedById : null,
        uploadedAt: new Date(),
      };
    } else if (removeFile) {
      fileFields = { fileName: null, fileType: null, mimeType: null, fileUrl: null, fileSize: null, uploadedById: null, uploadedAt: null };
    }

    const contract = await prisma.customerContract.update({
      where: { id: contractId },
      data: {
        ...(contractType && { contractType }),
        ...(projectName !== null && { projectName: projectName || null }),
        ...(implementationIdRaw !== null && { implementationId: implementationIdRaw ? parseInt(implementationIdRaw) : null }),
        ...(contractDate && { contractDate: new Date(contractDate) }),
        ...(expiryDate !== null && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
        ...(status && { status }),
        ...fileFields,
      },
      include: { implementation: { select: { id: true, projectName: true } }, uploadedBy: { select: { firstName: true, lastName: true } } },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'CUSTOMER_CONTRACT_UPDATED',
        description: `${contract.contractType} contract updated`,
        performedById: Number.isFinite(performedById) ? performedById : null,
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'CUSTOMER_CONTRACT', entityId: contract.id, oldValue: existing, newValue: contract, description: `Customer contract updated`, request });

    return NextResponse.json(contract);
  } catch (error: any) {
    console.error('PUT /api/customers/[id]/contracts/[contractId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update contract' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; contractId: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const contractId = parseInt(params.contractId);

    const existing = await prisma.customerContract.findUnique({ where: { id: contractId } });
    if (!existing || existing.leadId !== leadId) return NextResponse.json({ message: 'Contract not found' }, { status: 404 });

    await prisma.customerContract.delete({ where: { id: contractId } });
    await logAudit({ action: 'DELETE', entityType: 'CUSTOMER_CONTRACT', entityId: contractId, oldValue: existing, description: `Customer contract deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/customers/[id]/contracts/[contractId] error:', error);
    return NextResponse.json({ message: 'Failed to delete contract' }, { status: 400 });
  }
}
