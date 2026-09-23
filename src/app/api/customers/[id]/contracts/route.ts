import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateCustomerDocumentFile, fileExtension } from '@/lib/customerDocumentUpload';
import { isS3Configured, uploadContractFileToS3, resolveContractFileUrl } from '@/lib/customerContractS3';

export const dynamic = 'force-dynamic';

const CONTRACT_TYPES = ['NDA', 'MSA', 'SOW', 'COMMERCIAL_AGREEMENT', 'OTHER'];
const CONTRACT_STATUSES = ['DRAFT', 'SENT', 'SIGNED', 'EXPIRED', 'TERMINATED'];

// Customer-owned NDA/Contract endpoint — many per Lead (a Lead with
// status=CONFIRMED, i.e. a "Customer"). Fully independent of Lead's own
// API/pages.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const contracts = await prisma.customerContract.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        implementation: { select: { id: true, projectName: true } },
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
    });
    // Sign a fresh S3 URL for every contract's attachment on the way out —
    // see resolveContractFileUrl in customerContractS3.ts for why this is
    // needed (private bucket, short-lived links) and why it's a no-op for
    // pre-migration rows that still hold a plain Vercel Blob URL.
    const withResolvedUrls = await Promise.all(
      contracts.map(async (c) => (c.fileUrl ? { ...c, fileUrl: await resolveContractFileUrl(c.fileUrl, c.fileName) } : c))
    );
    return NextResponse.json(withResolvedUrls);
  } catch (error) {
    console.error('GET /api/customers/[id]/contracts error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Create a new contract. Accepts multipart/form-data so the attached
// file (optional) can be submitted in the same request as the fields —
// matches the wireframe's single "Save Contract" action.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });

    const formData = await request.formData();
    const contractType = formData.get('contractType') as string | null;
    const projectName = (formData.get('projectName') as string) || null;
    const implementationIdRaw = formData.get('implementationId') as string | null;
    const contractDate = formData.get('contractDate') as string | null;
    const expiryDate = formData.get('expiryDate') as string | null;
    const status = (formData.get('status') as string) || 'DRAFT';
    const file = formData.get('file') as File | null;

    if (!contractType || !CONTRACT_TYPES.includes(contractType)) {
      return NextResponse.json({ message: 'A valid Contract Type is required' }, { status: 400 });
    }
    if (!contractDate || isNaN(Date.parse(contractDate))) {
      return NextResponse.json({ message: 'A valid Date is required' }, { status: 400 });
    }
    if (expiryDate && isNaN(Date.parse(expiryDate))) {
      return NextResponse.json({ message: 'Expiry/Renewal Date is invalid' }, { status: 400 });
    }
    if (!CONTRACT_STATUSES.includes(status)) {
      return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
    }

    let fileFields: Record<string, any> = {};
    if (file) {
      if (!isS3Configured()) {
        return NextResponse.json(
          { message: 'File upload is not configured (missing AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / AWS_S3_BUCKET) — set these to enable attachments' },
          { status: 503 }
        );
      }
      const validationError = validateCustomerDocumentFile(file);
      if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });
      const { key } = await uploadContractFileToS3(file, 'customer-contracts');
      fileFields = {
        fileName: file.name,
        fileType: fileExtension(file.name) || null,
        mimeType: file.type || null,
        fileUrl: key,
        fileSize: file.size,
        uploadedAt: new Date(),
      };
    }

    const session = await getServerSession(authOptions);
    const performedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const contract = await prisma.customerContract.create({
      data: {
        leadId,
        contractType,
        projectName,
        implementationId: implementationIdRaw ? parseInt(implementationIdRaw) : null,
        contractDate: new Date(contractDate),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        status,
        ...fileFields,
        uploadedById: file && Number.isFinite(performedById) ? performedById : null,
      },
      include: {
        implementation: { select: { id: true, projectName: true } },
        uploadedBy: { select: { firstName: true, lastName: true } },
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'CUSTOMER_CONTRACT_CREATED',
        description: `${contractType} contract added for ${lead.companyName}`,
        performedById: Number.isFinite(performedById) ? performedById : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'CUSTOMER_CONTRACT', entityId: contract.id, newValue: contract, description: `Customer contract created: ${lead.companyName}`, request });

    const response = contract.fileUrl ? { ...contract, fileUrl: await resolveContractFileUrl(contract.fileUrl, contract.fileName) } : contract;
    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/customers/[id]/contracts error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create contract' }, { status: 400 });
  }
}
