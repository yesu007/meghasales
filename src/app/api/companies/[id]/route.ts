import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_companies');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        legalEntities: {
          orderBy: { legalName: 'asc' },
          include: {
            country: { select: { id: true, countryName: true, isoCode: true, flagEmoji: true } },
            _count: { select: { documents: true, leads: true, quotations: true } },
          },
        },
        _count: { select: { leads: true } },
      },
    });
    if (!company) return NextResponse.json({ message: 'Company not found' }, { status: 404 });
    return NextResponse.json(company);
  } catch (error) {
    console.error('GET /api/companies/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.company.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Company not found' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (!String(body.name).trim()) return NextResponse.json({ message: 'Company name cannot be empty' }, { status: 400 });
      data.name = String(body.name).trim();
    }
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.isActive !== undefined) data.isActive = !!body.isActive;

    const company = await prisma.company.update({ where: { id }, data });
    await logAudit({ action: 'UPDATE', entityType: 'COMPANY', entityId: id, oldValue: existing, newValue: company, description: `Company "${company.name}" updated`, request });

    return NextResponse.json(company);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A company with this name already exists' }, { status: 409 });
    }
    console.error('PATCH /api/companies/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update company' }, { status: 400 });
  }
}

// Only removable if nothing references it — a company with any Lead or
// legal entity already in use represents real business history that must
// not silently disappear; deactivating (isActive: false via PATCH) is the
// path for "we don't work with them anymore" instead.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.company.findUnique({ where: { id }, include: { _count: { select: { leads: true, legalEntities: true } } } });
    if (!existing) return NextResponse.json({ message: 'Company not found' }, { status: 404 });

    if (existing._count.leads > 0) {
      return NextResponse.json({ message: `Cannot delete — ${existing._count.leads} lead(s)/customer(s) are linked to this company. Deactivate it instead.` }, { status: 409 });
    }

    await prisma.company.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'COMPANY', entityId: id, oldValue: existing, description: `Company "${existing.name}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('DELETE /api/companies/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete company' }, { status: 400 });
  }
}
