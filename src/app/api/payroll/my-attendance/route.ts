import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ensureEmployeeForUser } from '@/lib/payroll/selfEmployee';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { periodRange } from '@/lib/payroll/timesheetEngine';
import { buildTimesheetRow } from '@/lib/payroll/timesheetRow';

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

    const row = await buildTimesheetRow(prisma, {
      employee,
      periodStart: start,
      periodEnd: end,
      entry,
      holidays,
      loanDeduction: repayments.reduce((s, r) => s + Number(r.amount), 0),
    });

    return NextResponse.json({
      employee: { employeeCode: employee.employeeCode, name: row.name, designation: employee.designation, department: employee.department },
      period: { year, month, status: period?.status || 'OPEN', submittedAt: period?.submittedAt || null },
      weeklyOffSaturdays: profile?.weeklyOffSaturdays || 'SECOND_FOURTH',
      // This month's Holiday Calendar entries (already loaded above for the
      // row) — the day strip greys these dates out.
      holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
      row,
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
