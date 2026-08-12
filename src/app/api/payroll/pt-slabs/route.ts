import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const slabs = await prisma.ptSlab.findMany({ orderBy: [{ isActive: 'desc' }, { minGross: 'asc' }] });
    return NextResponse.json(slabs);
  } catch (error) {
    console.error('GET /api/payroll/pt-slabs error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (body.minGross == null || body.monthlyAmount == null) {
      return NextResponse.json({ message: 'minGross and monthlyAmount are required' }, { status: 400 });
    }

    const slab = await prisma.ptSlab.create({
      data: {
        state: body.state || 'TN',
        minGross: Number(body.minGross),
        maxGross: body.maxGross != null && body.maxGross !== '' ? Number(body.maxGross) : null,
        monthlyAmount: Number(body.monthlyAmount),
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'PT_SLAB', entityId: slab.id, newValue: slab, description: `PT slab added: ${slab.state} ₹${slab.minGross}-${slab.maxGross ?? '∞'} → ₹${slab.monthlyAmount}/mo`, request });

    return NextResponse.json(slab, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/pt-slabs error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create PT slab' }, { status: 400 });
  }
}
