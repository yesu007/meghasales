import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: { id: string; entityId: string } }) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;

  try {
    const companyId = parseInt(params.id);
    const id = parseInt(params.entityId);
    const existing = await prisma.companyLegalEntity.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ message: 'Legal entity not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    // countryId is intentionally not editable here — changing jurisdiction
    // on an existing entity would silently invalidate its tax registration
    // number and any billing history already tied to it; delete and
    // recreate under the right country instead.
    if (body.legalName !== undefined) {
      if (!String(body.legalName).trim()) return NextResponse.json({ message: 'Registered legal name cannot be empty' }, { status: 400 });
      data.legalName = String(body.legalName).trim();
    }
    for (const field of ['registrationNumber', 'taxRegistrationNumber', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'currencyCode'] as const) {
      if (body[field] !== undefined) data[field] = body[field] || null;
    }
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const entity = await prisma.companyLegalEntity.update({
      where: { id },
      data,
      include: { country: { select: { id: true, countryName: true, isoCode: true, flagEmoji: true } } },
    });

    await logAudit({ action: 'UPDATE', entityType: 'COMPANY_LEGAL_ENTITY', entityId: id, oldValue: existing, newValue: entity, description: `Legal entity "${entity.legalName}" updated`, request });

    return NextResponse.json(entity);
  } catch (error: any) {
    console.error('PATCH /api/companies/[id]/legal-entities/[entityId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update legal entity' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; entityId: string } }) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;

  try {
    const companyId = parseInt(params.id);
    const id = parseInt(params.entityId);
    const existing = await prisma.companyLegalEntity.findUnique({
      where: { id },
      include: { _count: { select: { leads: true, quotations: true, invoices: true } } },
    });
    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ message: 'Legal entity not found' }, { status: 404 });
    }

    const refs = existing._count.leads + existing._count.quotations + existing._count.invoices;
    if (refs > 0) {
      return NextResponse.json({ message: `Cannot delete — ${refs} lead(s)/quotation(s)/invoice(s) are billed to this entity. Deactivate it instead.` }, { status: 409 });
    }

    await prisma.companyLegalEntity.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'COMPANY_LEGAL_ENTITY', entityId: id, oldValue: existing, description: `Legal entity "${existing.legalName}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('DELETE /api/companies/[id]/legal-entities/[entityId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete legal entity' }, { status: 400 });
  }
}
