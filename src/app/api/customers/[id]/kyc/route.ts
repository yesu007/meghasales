import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

const VERIFICATION_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'];

// Customer-owned KYC endpoint — 1:1 with a Lead (a Lead with
// status=CONFIRMED, i.e. a "Customer"). Fully independent of Lead's own
// API/pages; reuses only the Lead row itself as the parent record.
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const kyc = await prisma.customerKyc.findUnique({
      where: { leadId },
      include: {
        verifiedBy: { select: { firstName: true, lastName: true } },
        documents: {
          orderBy: { uploadedAt: 'desc' },
          include: { uploadedBy: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    return NextResponse.json(kyc);
  } catch (error) {
    console.error('GET /api/customers/[id]/kyc error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Upsert — a customer has at most one KYC record, created on first save.
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_leads');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ message: 'Customer not found' }, { status: 404 });

    const body = await request.json();

    if (!body.legalCompanyName) {
      return NextResponse.json({ message: 'Legal Company Name is required' }, { status: 400 });
    }
    if (body.verificationStatus && !VERIFICATION_STATUSES.includes(body.verificationStatus)) {
      return NextResponse.json({ message: 'Invalid verification status' }, { status: 400 });
    }

    const data = {
      legalCompanyName: body.legalCompanyName,
      registrationTaxId: body.registrationTaxId || null,
      billingAddress: body.billingAddress || null,
      authorizedContact: body.authorizedContact || null,
      verificationStatus: body.verificationStatus || 'PENDING',
      verifiedById: body.verifiedById ? parseInt(body.verifiedById) : null,
      verifiedAt: body.verifiedAt ? new Date(body.verifiedAt) : null,
    };

    const existing = await prisma.customerKyc.findUnique({ where: { leadId } });

    const kyc = await prisma.customerKyc.upsert({
      where: { leadId },
      create: { leadId, ...data },
      update: data,
      include: { verifiedBy: { select: { firstName: true, lastName: true } } },
    });

    const session = await getServerSession(authOptions);
    const performedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: existing ? 'CUSTOMER_KYC_UPDATED' : 'CUSTOMER_KYC_CREATED',
        description: existing ? `KYC details updated for ${lead.companyName}` : `KYC details added for ${lead.companyName}`,
        performedById: Number.isFinite(performedById) ? performedById : null,
      },
    });

    await logAudit({
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'CUSTOMER_KYC',
      entityId: kyc.id,
      oldValue: existing,
      newValue: kyc,
      description: `Customer KYC saved: ${lead.companyName}`,
      request,
    });

    return NextResponse.json(kyc);
  } catch (error: any) {
    console.error('PUT /api/customers/[id]/kyc error:', error);
    return NextResponse.json({ message: error.message || 'Failed to save KYC details' }, { status: 400 });
  }
}
