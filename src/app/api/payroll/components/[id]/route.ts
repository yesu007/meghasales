import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// code is deliberately not editable here — Phase 2's run engine will look
// components up by code (e.g. "the BASIC component"), so once set it stays
// the stable handle. Everything else (including isStatutory) can change.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.salaryComponent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Component not found' }, { status: 404 });

    const body = await request.json();
    if (body.type && !['EARNING', 'DEDUCTION'].includes(body.type)) {
      return NextResponse.json({ message: 'type must be EARNING or DEDUCTION' }, { status: 400 });
    }
    if (body.calculationType && !['FLAT', 'PERCENT_OF_BASIC'].includes(body.calculationType)) {
      return NextResponse.json({ message: 'calculationType must be FLAT or PERCENT_OF_BASIC' }, { status: 400 });
    }
    if (body.statutoryType !== undefined && body.statutoryType !== null && !['PF', 'ESI', 'PT'].includes(body.statutoryType)) {
      return NextResponse.json({ message: 'statutoryType must be PF, ESI, PT, or null' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    for (const field of ['name', 'type', 'calculationType', 'isStatutory', 'isActive', 'sortOrder', 'statutoryType'] as const) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    const component = await prisma.salaryComponent.update({ where: { id }, data });
    await logAudit({ action: 'UPDATE', entityType: 'SALARY_COMPONENT', entityId: component.id, oldValue: existing, newValue: component, description: `Salary component "${component.name}" updated`, request });

    return NextResponse.json(component);
  } catch (error: any) {
    console.error('PATCH /api/payroll/components/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update component' }, { status: 400 });
  }
}
