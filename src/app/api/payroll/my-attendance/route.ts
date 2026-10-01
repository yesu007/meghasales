import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ensureEmployeeForUser } from '@/lib/payroll/selfEmployee';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { periodRange } from '@/lib/payroll/timesheetEngine';
import { buildTimesheetRow } from '@/lib/payroll/timesheetRow';
import { buildDailyAttendanceRows } from '@/lib/payroll/dailyAttendance';
import { loadAttendanceDayCounts } from '@/lib/payroll/regularDays';
import { teamLabel } from '@/lib/payroll/teamWeekOff';
import { loadTeamResolver } from '@/lib/payroll/weekOffConfig';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

function parsePeriod(searchParams: URLSearchParams): { year: number; month: number } {
  const now = new Date();
  const year = parseInt(searchParams.get('year') || '', 10) || now.getFullYear();
  const month = parseInt(searchParams.get('month') || '', 10) || now.getMonth() + 1;
  return { year, month };
}

// My Space → Attendance — self-service, like leave-requests/mine and
// my-payslips: no permission check, and deliberately no employeeId
// parameter — the Employee is always resolved from the session's own
// userId, so nobody can read another employee's attendance through here.
// The row itself comes from buildTimesheetRow, the same computation GET
// /api/payroll/timesheet runs for every employee, so the figures (Total
// Days especially) always match what Payroll sees on Time & Attendance.
export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (!userId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const { year, month } = parsePeriod(new URL(request.url).searchParams);
    if (month < 1 || month > 12) return NextResponse.json({ message: 'Invalid month' }, { status: 400 });

    const employee = await ensureEmployeeForUser(userId);
    if (!employee) return NextResponse.json({ employee: null, period: { year, month }, row: null, leaves: [] });

    const { start, end } = periodRange(year, month);

    const [entry, holidays, period, repayments, leaves, profile] = await Promise.all([
      prisma.timesheetEntry.findUnique({ where: { employeeId_periodYear_periodMonth: { employeeId: employee.id, periodYear: year, periodMonth: month } } }),
      prisma.paidHoliday.findMany({ where: { isActive: true, date: { gte: start, lte: end } } }),
      prisma.timesheetPeriod.findUnique({ where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } } }),
      prisma.loanRepayment.findMany({ where: { periodYear: year, periodMonth: month, loan: { employeeId: employee.id } }, select: { amount: true } }),
      // Every request overlapping the month, whatever its status — the
      // employee should see pending/rejected ones too; only APPROVED ones
      // feed the row above (computeLeaveHours/computePaidHolidayLeaveDays/
      // computeAutoLopDays all filter on that themselves).
      prisma.leaveRequest.findMany({
        where: { employeeId: employee.id, startDate: { lte: end }, endDate: { gte: start } },
        include: { leaveType: { select: { name: true, code: true, isPaid: true } } },
        orderBy: { startDate: 'asc' },
      }),
      // Only the weekly-off policy the day strip needs — the full
      // statutory-settings endpoint is gated behind view_payroll.
      prisma.companyProfile.findFirst({ select: { weeklyOffSaturdays: true } }),
    ]);

    // Daily login/logout/working hours from the Access Control device —
    // the same rows Payroll sees on Time & Attendance → Attendance Log,
    // scoped to this employee only.
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const daily = await buildDailyAttendanceRows({ from: `${monthStr}-01`, to: monthEnd, employeeId: employee.id });

    // The employee's week-off team (shown on the page) — as of the month's last day.
    const teamOf = await loadTeamResolver(prisma, [employee], `${monthStr}-01`, monthEnd);
    const currentTeam = teamOf(employee.id, monthEnd);

    const row = await buildTimesheetRow(prisma, {
      employee,
      periodStart: start,
      periodEnd: end,
      entry,
      holidays,
      loanDeduction: repayments.reduce((s, r) => s + Number(r.amount), 0),
      dayCounts: (await loadAttendanceDayCounts(prisma, [employee], year, month)).get(employee.id)!,
    });

    return NextResponse.json({
      employee: { employeeCode: employee.employeeCode, name: row.name, designation: employee.designation, department: employee.department },
      period: { year, month, status: period?.status || 'OPEN', submittedAt: period?.submittedAt || null },
      weeklyOffSaturdays: profile?.weeklyOffSaturdays || 'SECOND_FOURTH',
      weekOffTeam: currentTeam ? { value: currentTeam, label: teamLabel(currentTeam) } : null,
      // This month's Holiday Calendar entries (already loaded above for the
      // row) — the day strip greys these dates out.
      holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
      row,
      hasLoginUserId: !!employee.accessControlId,
      // Attendance is tracked for this employee — by the device and/or
      // manual attendance requests — so the day strip can colour real data.
      // Any request still awaiting a decision — the page keeps refreshing
      // while this is > 0, so an approval turns the day Present by itself.
      pendingManualCount: await prisma.manualAttendanceRequest.count({ where: { employeeId: employee.id, status: 'PENDING' } }),
      attendanceTracked: !!employee.accessControlId || (await prisma.manualAttendanceRequest.count({ where: { employeeId: employee.id, status: { not: 'CANCELLED' } } })) > 0,
      daily: daily.map(({ date, loginTime, logoutTime, totalWorkingMinutes, workingHours, sessionCount, punchCount, status, leaveType, holidayName, source, manualStatus, workLocation, weekOffNote, commonWorking, deviceLoginTime }) => ({
        date, loginTime, logoutTime, totalWorkingMinutes, workingHours, sessionCount, punchCount, status, leaveType: leaveType ?? null, holidayName: holidayName ?? null,
        source: source ?? null, manualStatus: manualStatus ?? null, workLocation: workLocation ?? null,
        weekOffNote: weekOffNote ?? null, commonWorking: !!commonWorking, deviceLoginTime: deviceLoginTime ?? null,
      })),
      leaves: leaves.map((r) => ({
        id: r.id,
        startDate: r.startDate,
        endDate: r.endDate,
        days: Number(r.days),
        status: r.status,
        leaveType: r.leaveType,
      })),
    });
  } catch (error) {
    console.error('GET /api/payroll/my-attendance error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
