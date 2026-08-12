import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id);
    const assignments = await prisma.salaryStructureAssignment.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: { structure: { select: { id: true, name: true } } },
    });
    return NextResponse.json(assignments);
  } catch (error) {
    console.error('GET /api/payroll/employees/[id]/assignments error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Assigning a structure is an increment, not an edit — the previous
// open-ended assignment (effectiveTo: null) gets closed the day before the
// new one starts, rather than being overwritten, so
// SalaryStructureAssignment stays a full history a payroll run can look up
// "what was this employee's CTC in March" against later.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id);
    const body = await request.json();
    const { structureId, ctcAnnual, effectiveFrom } = body;
    if (!structureId || ctcAnnual == null || !effectiveFrom) {
      return NextResponse.json({ message: 'structureId, ctcAnnual, and effectiveFrom are required' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const structure = await prisma.salaryStructure.findUnique({ where: { id: Number(structureId) } });
    if (!structure) return NextResponse.json({ message: 'Salary structure not found' }, { status: 404 });

    const newFrom = new Date(effectiveFrom);
    const openAssignment = await prisma.salaryStructureAssignment.findFirst({
      where: { employeeId, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (openAssignment && newFrom <= openAssignment.effectiveFrom) {
      return NextResponse.json({ message: `The new assignment must start after the current one's start date (${openAssignment.effectiveFrom.toISOString().slice(0, 10)})` }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const createdById = currentUserId(session);

    const assignment = await prisma.$transaction(async (tx) => {
      if (openAssignment) {
        const dayBefore = new Date(newFrom);
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
        await tx.salaryStructureAssignment.update({ where: { id: openAssignment.id }, data: { effectiveTo: dayBefore, version: { increment: 1 } } });
      }
      return tx.salaryStructureAssignment.create({
        data: { employeeId, structureId: Number(structureId), ctcAnnual: Number(ctcAnnual), effectiveFrom: newFrom, createdById },
      });
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'SALARY_STRUCTURE_ASSIGNMENT',
      entityId: assignment.id,
      newValue: assignment,
      description: `${employee.employeeCode} assigned "${structure.name}" at ₹${Number(ctcAnnual).toLocaleString('en-IN')}/yr from ${newFrom.toISOString().slice(0, 10)}`,
      request,
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/employees/[id]/assignments error:', error);
    return NextResponse.json({ message: error.message || 'Failed to assign salary structure' }, { status: 400 });
  }
}
