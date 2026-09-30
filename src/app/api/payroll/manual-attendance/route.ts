import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { MANUAL_ATTENDANCE_STATUSES } from '@/lib/payroll/manualAttendance';
import { deviceUtcOffsetMinutes, utcToLocal } from '@/lib/payroll/attendanceLog';

export const dynamic = 'force-dynamic';

// The approval queue — every employee's manual attendance requests.
// view_timesheet to see it; approve_manual_attendance (checked in
// [id]/route.ts) to act on one. Optional ?status=.
export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_timesheet');
  if (denied) return denied;

  try {
    const status = new URL(request.url).searchParams.get('status') || '';
    if (status && !(MANUAL_ATTENDANCE_STATUSES as readonly string[]).includes(status)) return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
    const requests = await prisma.manualAttendanceRequest.findMany({
      where: status ? { status } : {},
      include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true } } },
      orderBy: [{ status: 'asc' }, { appliedAt: 'desc' }],
      take: 500,
    });
    // What the device recorded that day (e.g. a Missing-logout correction), for the approver.
    const summaries = requests.length
      ? await prisma.dailyAttendanceSummary.findMany({
          where: { OR: requests.map((r) => ({ employeeId: r.employeeId, attendanceDate: r.attendanceDate })) },
          select: { employeeId: true, attendanceDate: true, status: true, loginTime: true },
        })
      : [];
    const offset = deviceUtcOffsetMinutes();
    const deviceByKey = new Map(summaries.map((d) => [`${d.employeeId}|${d.attendanceDate.toISOString().slice(0, 10)}`, d]));
    return NextResponse.json(requests.map((r) => {
      const date = r.attendanceDate.toISOString().slice(0, 10);
      const d = deviceByKey.get(`${r.employeeId}|${date}`);
      return { ...r, attendanceDate: date, device: d ? { status: d.status, loginTime: d.loginTime ? utcToLocal(d.loginTime, offset).time : null } : null };
    }));
  } catch (error) {
    console.error('GET /api/payroll/manual-attendance error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
