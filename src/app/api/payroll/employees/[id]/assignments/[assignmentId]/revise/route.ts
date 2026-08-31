import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// A revision changes an assignment's CTC while keeping a permanent
// before/after record — same shape as ExpenseBudget's /revise. The
// assignment row is updated in place (payroll runs always read the current
// CTC); SalaryAssignmentRevision is the append-only history of how it got
// there.
export async function POST(request: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
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
    if (body.newCtc === undefined || body.newCtc === null || body.newCtc === '') {
      return NextResponse.json({ message: 'newCtc is required' }, { status: 400 });
    }
    const newCtc = Number(body.newCtc);
    if (!Number.isFinite(newCtc) || newCtc <= 0) {
      return NextResponse.json({ message: 'newCtc must be a positive number' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const revisedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const [assignment] = await prisma.$transaction([
      prisma.salaryStructureAssignment.update({
        where: { id },
        data: { ctcAnnual: newCtc, version: { increment: 1 } },
        include: { structure: { select: { id: true, name: true } } },
      }),
      prisma.salaryAssignmentRevision.create({
        data: {
          assignmentId: id,
          previousCtc: existing.ctcAnnual,
          newCtc,
          reason: body.reason || null,
          revisedById: Number.isFinite(revisedById) ? revisedById : null,
        },
      }),
    ]);

    await logAudit({
      action: 'UPDATE',
      entityType: 'SALARY_STRUCTURE_ASSIGNMENT',
      entityId: id,
      oldValue: { ctcAnnual: existing.ctcAnnual },
      newValue: { ctcAnnual: newCtc },
      description: `Salary assignment #${id} CTC revised: ${existing.ctcAnnual} → ${newCtc}${body.reason ? ` (${body.reason})` : ''}`,
      request,
    });

    return NextResponse.json(assignment);
  } catch (error: any) {
    console.error('POST /api/payroll/employees/[id]/assignments/[assignmentId]/revise error:', error);
    return NextResponse.json({ message: error.message || 'Failed to revise salary assignment' }, { status: 400 });
  }
}
