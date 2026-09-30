import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { createShiftAssignment } from '@/lib/payroll/shiftEngine';
import { isWeekOffTeam, teamLabel } from '@/lib/payroll/teamWeekOff';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_shifts');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id);
    const assignments = await prisma.employeeShiftAssignment.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
      include: { shift: { select: { id: true, name: true, startTime: true, endTime: true } } },
    });
    return NextResponse.json(assignments);
  } catch (error) {
    console.error('GET /api/payroll/employees/[id]/shift-assignments error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Same increment-not-edit pattern as SalaryStructureAssignment: the
// previous open-ended assignment is closed the day before the new one
// starts, so historical attendance can always resolve "what shift was this
// employee on" for a past date, unaffected by later re-assignments.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('edit_shifts');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id);
    const body = await request.json();
    const { shiftId, effectiveFrom } = body;
    if (!shiftId || !effectiveFrom) {
      return NextResponse.json({ message: 'shiftId and effectiveFrom are required' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const shift = await prisma.shift.findUnique({ where: { id: Number(shiftId) } });
    if (!shift) return NextResponse.json({ message: 'Shift not found' }, { status: 404 });

    const newFrom = new Date(effectiveFrom);
    if (Number.isNaN(newFrom.getTime())) return NextResponse.json({ message: 'effectiveFrom is not a valid date' }, { status: 400 });
    const weekOffTeam = body.weekOffTeam || null;
    if (weekOffTeam && !isWeekOffTeam(weekOffTeam)) return NextResponse.json({ message: 'Team must be Team A or Team B' }, { status: 400 });

    const session = await getServerSession(authOptions);
    const createdById = currentUserId(session);

    let assignment;
    try {
      assignment = await prisma.$transaction((tx) => createShiftAssignment(tx, { employeeId, shiftId: Number(shiftId), effectiveFrom: newFrom, weekOffTeam, createdById }));
    } catch (err: any) {
      return NextResponse.json({ message: err.message || 'Failed to assign shift' }, { status: 400 });
    }

    await logAudit({
      action: 'CREATE',
      entityType: 'EMPLOYEE_SHIFT_ASSIGNMENT',
      entityId: assignment.id,
      newValue: assignment,
      description: `${employee.employeeCode} assigned shift "${shift.name}"${weekOffTeam ? ` (${teamLabel(weekOffTeam)})` : ''} from ${newFrom.toISOString().slice(0, 10)}`,
      request,
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/employees/[id]/shift-assignments error:', error);
    return NextResponse.json({ message: error.message || 'Failed to assign shift' }, { status: 400 });
  }
}
