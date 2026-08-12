import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        salaryAssignments: {
          orderBy: { effectiveFrom: 'desc' },
          include: { structure: { select: { id: true, name: true } } },
        },
      },
    });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });
    return NextResponse.json(employee);
  } catch (error) {
    console.error('GET /api/payroll/employees/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

const EDITABLE_FIELDS = [
  'department', 'designation', 'employmentType', 'panNumber', 'uanNumber', 'esicNumber',
  'bankAccountNumber', 'bankIfsc', 'bankAccountHolder', 'bankName', 'taxRegime',
  'pfApplicable', 'esiApplicable', 'ptApplicable', 'status',
] as const;
const DATE_FIELDS = ['dateOfJoining', 'dateOfLeaving'] as const;

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field] === '' ? null : body[field];
    }
    for (const field of DATE_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field] ? new Date(body[field]) : null;
    }

    const employee = await prisma.employee.update({ where: { id }, data });
    await logAudit({ action: 'UPDATE', entityType: 'EMPLOYEE', entityId: employee.id, oldValue: existing, newValue: employee, description: `Employee ${employee.employeeCode} profile updated`, request });

    return NextResponse.json(employee);
  } catch (error: any) {
    console.error('PATCH /api/payroll/employees/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update employee' }, { status: 400 });
  }
}
