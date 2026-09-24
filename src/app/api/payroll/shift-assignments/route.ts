import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// Company-wide Employee Shift Assignment table (Shift Master's own screen)
// — every assignment, current and historical, across every employee, so
// Management can see "who's on what shift" and how it's changed over time
// in one place, rather than the employee-scoped GET at
// /api/payroll/employees/[id]/shift-assignments this reuses no logic from
// (read-only listing, so there's nothing to share). Sorted by employee
// name, most recent effectiveFrom first within each employee's own rows —
// each employee's current assignment (effectiveTo: null) naturally sorts
// above their own history.
export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const assignments = await prisma.employeeShiftAssignment.findMany({
      orderBy: [{ employee: { firstName: 'asc' } }, { employee: { lastName: 'asc' } }, { effectiveFrom: 'desc' }],
      include: {
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        shift: { select: { id: true, name: true, startTime: true, endTime: true, attendanceRequirement: true } },
      },
    });
    return NextResponse.json(assignments);
  } catch (error) {
    console.error('GET /api/payroll/shift-assignments error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
