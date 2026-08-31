import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// Direct edits to structure/effective dates — the CTC itself goes through
// /revise instead, so a value change always keeps a tracked before/after
// (see SalaryAssignmentRevision), the same split ExpenseBudget uses between
// its plain PATCH and its /revise endpoint.
export async function PATCH(request: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id);
    const id = parseInt(params.assignmentId);

    const existing = await prisma.salaryStructureAssignment.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== employeeId) {
      return NextResponse.json({ message: 'Salary structure assignment not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.structureId !== undefined) {
      const structure = await prisma.salaryStructure.findUnique({ where: { id: Number(body.structureId) } });
      if (!structure) return NextResponse.json({ message: 'Salary structure not found' }, { status: 404 });
      data.structureId = structure.id;
    }

    const effectiveFrom = body.effectiveFrom !== undefined ? new Date(body.effectiveFrom) : existing.effectiveFrom;
    const effectiveTo = body.effectiveTo !== undefined ? (body.effectiveTo ? new Date(body.effectiveTo) : null) : existing.effectiveTo;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      return NextResponse.json({ message: 'Effective To must be after Effective From' }, { status: 400 });
    }
    if (body.effectiveFrom !== undefined) data.effectiveFrom = effectiveFrom;
    if (body.effectiveTo !== undefined) data.effectiveTo = effectiveTo;

    const assignment = await prisma.salaryStructureAssignment.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: { structure: { select: { id: true, name: true } } },
    });

    await logAudit({
      action: 'UPDATE',
      entityType: 'SALARY_STRUCTURE_ASSIGNMENT',
      entityId: id,
      oldValue: existing,
      newValue: assignment,
      description: `Salary assignment #${id} updated`,
      request,
    });

    return NextResponse.json(assignment);
  } catch (error: any) {
    console.error('PATCH /api/payroll/employees/[id]/assignments/[assignmentId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update salary assignment' }, { status: 400 });
  }
}
