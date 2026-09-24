import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { periodRange, computeLeaveHours, computePaidHolidayHours, computeOtherLeaveDays, computeTotalDaysFromHours, HOURS_PER_DAY } from '@/lib/payroll/timesheetEngine';
import { computeAutoLopDays } from '@/lib/payroll/leaveEngine';
import { round2 } from '@/lib/payroll/runEngine';
import { resolveShiftForEmployeeOnDate } from '@/lib/payroll/shiftEngine';

export const dynamic = 'force-dynamic';

function parsePeriod(searchParams: URLSearchParams): { year: number; month: number } {
  const now = new Date();
  const year = parseInt(searchParams.get('year') || '', 10) || now.getFullYear();
  const month = parseInt(searchParams.get('month') || '', 10) || now.getMonth() + 1;
  return { year, month };
}

// One row per employee, joining an entered TimesheetEntry (Regular/
// Overtime, defaulting to 0 when nothing's been entered yet) with hours
// derived live from LeaveRequest and PaidHoliday — same "single source of
// truth, nothing to keep in sync" convention LeaveRequest.days already uses
// instead of a separate balance table.
export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const { year, month } = parsePeriod(new URL(request.url).searchParams);
    const { start, end } = periodRange(year, month);

    const [employees, entries, holidays, period] = await Promise.all([
      prisma.employee.findMany({ orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] }),
      prisma.timesheetEntry.findMany({ where: { periodYear: year, periodMonth: month } }),
      prisma.paidHoliday.findMany({ where: { isActive: true, date: { gte: start, lte: end } } }),
      prisma.timesheetPeriod.findUnique({ where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } } }),
    ]);

    const entryByEmployee = new Map(entries.map((e) => [e.employeeId, e]));

    // Loan Deduction column — the amount actually sent to Payroll for this
    // employee's loan(s) for this exact period (see loans/[id]/apply-to-run),
    // not a projection of what an active loan's installment would be. Kept
    // in sync with Payroll by construction: it's the same LoanRepayment row
    // Payroll itself reads, not a second independently-computed figure.
    // Period-scoped rather than joined through a PayrollRun — an
    // installment can be sent (and shown here) before that month's run
    // even exists.
    const loanDeductionByEmployee = new Map<number, number>();
    const repayments = await prisma.loanRepayment.findMany({ where: { periodYear: year, periodMonth: month }, include: { loan: { select: { employeeId: true } } } });
    for (const r of repayments) {
      loanDeductionByEmployee.set(r.loan.employeeId, (loanDeductionByEmployee.get(r.loan.employeeId) || 0) + Number(r.amount));
    }

    const rows = await Promise.all(
      employees.map(async (emp) => {
        const entry = entryByEmployee.get(emp.id);
        const regularHours = entry ? Number(entry.regularHours) : 0;
        const overtimeHours = entry ? Number(entry.overtimeHours) : 0;
        const { sickLeaveHours, ptoHours, earnedLeaveHours, paidHolidayLeaveHours } = await computeLeaveHours(prisma, emp.id, start, end);
        // Paid Holiday combines two independent sources into one column: the
        // company holiday calendar (companyHolidayHours) and any of this
        // employee's own APPROVED "Paid Holidays" leave requests
        // (paidHolidayLeaveHours) — either one alone should show up here.
        const companyHolidayHours = computePaidHolidayHours(holidays, start, end, emp);
        const paidHolidayHours = round2(companyHolidayHours + paidHolidayLeaveHours);

        // Shift Master — resolved independently of the hours/leave figures
        // above. Shift is looked up as of the period's last day (same
        // "which assignment governs this period" convention
        // SalaryStructureAssignment already uses) — shown here purely for
        // visibility, no bearing on lopDays/totalDays.
        const shift = await resolveShiftForEmployeeOnDate(prisma, emp.id, end);

        const lopDays = await computeAutoLopDays(prisma, emp.id, start, end);
        // Regular/Overtime are entered directly as days (no 8-hours=1-day
        // conversion). otherLeaveDays sums every approved leave request in
        // this period except Earned Leave and LOP (see
        // TOTAL_DAYS_EXCLUDED_CODES) and adds to Total Days; the company
        // holiday calendar's own days (companyHolidayHours — NOT the
        // combined paidHolidayHours column, to avoid double-counting the
        // leave-request portion already in otherLeaveDays) also add; Earned
        // Leave (its own informational column) never touches it; LOP
        // (already in days) subtracts — see computeTotalDaysFromHours.
        const otherLeaveDays = await computeOtherLeaveDays(prisma, emp.id, start, end);
        const companyHolidayDays = round2(companyHolidayHours / HOURS_PER_DAY);
        const totalDays = computeTotalDaysFromHours(regularHours, overtimeHours, otherLeaveDays, lopDays, companyHolidayDays);

        return {
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          name: `${emp.firstName} ${emp.lastName}`,
          department: emp.department,
          designation: emp.designation,
          employmentType: emp.employmentType,
          status: emp.status,
          timesheetStatus: emp.timesheetStatus,
          regularHours,
          overtimeHours,
          sickLeaveHours,
          ptoHours,
          paidHolidayHours,
          earnedLeaveHours,
          lopDays,
          totalDays,
          loanDeduction: loanDeductionByEmployee.get(emp.id) || 0,
          shiftName: shift?.name ?? null,
        };
      })
    );

    return NextResponse.json({
      period: {
        year,
        month,
        status: period?.status || 'OPEN',
        submittedAt: period?.submittedAt || null,
      },
      employees: rows,
    });
  } catch (error) {
    console.error('GET /api/payroll/timesheet error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// Upserts one employee's Regular/Overtime totals for a period. Blocked once
// that period has been "Send to Payroll"'d (TimesheetPeriod.status ===
// SUBMITTED) — same locked-while-submitted idea as Payslip line items only
// being editable while their run is DRAFT.
export async function PATCH(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const body = await request.json();
    const employeeId = parseInt(body.employeeId, 10);
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);
    if (!employeeId || !year || !month) {
      return NextResponse.json({ message: 'employeeId, year, and month are required' }, { status: 400 });
    }
    const regularHours = body.regularHours != null ? Number(body.regularHours) : 0;
    const overtimeHours = body.overtimeHours != null ? Number(body.overtimeHours) : 0;
    if (!Number.isFinite(regularHours) || regularHours < 0 || !Number.isFinite(overtimeHours) || overtimeHours < 0) {
      return NextResponse.json({ message: 'Regular and Overtime days must be non-negative numbers' }, { status: 400 });
    }

    const period = await prisma.timesheetPeriod.findUnique({ where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } } });
    if (period?.status === 'SUBMITTED') {
      return NextResponse.json({ message: 'This timesheet period has been sent to payroll — reopen it before editing' }, { status: 409 });
    }

    const session = await getServerSession(authOptions);
    const updatedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const entry = await prisma.timesheetEntry.upsert({
      where: { employeeId_periodYear_periodMonth: { employeeId, periodYear: year, periodMonth: month } },
      update: { regularHours, overtimeHours, updatedById: Number.isFinite(updatedById) ? updatedById : null },
      create: { employeeId, periodYear: year, periodMonth: month, regularHours, overtimeHours, updatedById: Number.isFinite(updatedById) ? updatedById : null },
    });

    await logAudit({
      action: 'UPDATE',
      entityType: 'TIMESHEET_ENTRY',
      entityId: entry.id,
      newValue: { regularHours, overtimeHours },
      description: `Timesheet days for employee ${employeeId}, ${month}/${year} set to ${regularHours} regular / ${overtimeHours} overtime`,
      request,
    });

    return NextResponse.json(entry);
  } catch (error: any) {
    console.error('PATCH /api/payroll/timesheet error:', error);
    return NextResponse.json({ message: error.message || 'Failed to save timesheet entry' }, { status: 400 });
  }
}
