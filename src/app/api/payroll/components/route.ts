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
    const components = await prisma.salaryComponent.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return NextResponse.json(components);
  } catch (error) {
    console.error('GET /api/payroll/components error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name || !body.code || !body.type) {
      return NextResponse.json({ message: 'name, code, and type are required' }, { status: 400 });
    }
    if (!['EARNING', 'DEDUCTION'].includes(body.type)) {
      return NextResponse.json({ message: 'type must be EARNING or DEDUCTION' }, { status: 400 });
    }
    if (body.calculationType && !['FLAT', 'PERCENT_OF_BASIC'].includes(body.calculationType)) {
      return NextResponse.json({ message: 'calculationType must be FLAT or PERCENT_OF_BASIC' }, { status: 400 });
    }

    const component = await prisma.salaryComponent.create({
      data: {
        name: body.name,
        code: body.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        type: body.type,
        calculationType: body.calculationType || 'FLAT',
        isStatutory: !!body.isStatutory,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'SALARY_COMPONENT', entityId: component.id, newValue: component, description: `Salary component "${component.name}" created`, request });

    return NextResponse.json(component, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A component with that code already exists' }, { status: 409 });
    }
    console.error('POST /api/payroll/components error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create component' }, { status: 400 });
  }
}
