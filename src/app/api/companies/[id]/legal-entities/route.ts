import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// One legal entity per country a company is registered in — created here
// under its parent Company; listing happens via GET /api/companies/[id]
// (which already includes legalEntities), so this route is create-only.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;

  try {
    const companyId = parseInt(params.id);
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ message: 'Company not found' }, { status: 404 });

    const body = await request.json();
    if (!body.countryId) return NextResponse.json({ message: 'Country is required' }, { status: 400 });
    if (!body.legalName || !String(body.legalName).trim()) {
      return NextResponse.json({ message: 'Registered legal name is required' }, { status: 400 });
    }

    const country = await prisma.country.findUnique({ where: { id: parseInt(body.countryId) } });
    if (!country) return NextResponse.json({ message: 'Country not found' }, { status: 404 });

    const entity = await prisma.companyLegalEntity.create({
      data: {
        companyId,
        countryId: country.id,
        legalName: String(body.legalName).trim(),
        registrationNumber: body.registrationNumber || null,
        taxRegistrationNumber: body.taxRegistrationNumber || null,
        addressLine1: body.addressLine1 || null,
        addressLine2: body.addressLine2 || null,
        city: body.city || null,
        state: body.state || null,
        postalCode: body.postalCode || null,
        currencyCode: body.currencyCode || country.currencyCode,
      },
      include: { country: { select: { id: true, countryName: true, isoCode: true, flagEmoji: true } } },
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'COMPANY_LEGAL_ENTITY',
      entityId: entity.id,
      newValue: entity,
      description: `Legal entity "${entity.legalName}" (${country.countryName}) added to company "${company.name}"`,
      request,
    });

    return NextResponse.json(entity, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'This company already has a legal entity registered in that country' }, { status: 409 });
    }
    console.error('POST /api/companies/[id]/legal-entities error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add legal entity' }, { status: 400 });
  }
}
