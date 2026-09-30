import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { periodRange } from '@/lib/payroll/timesheetEngine';
import { buildTimesheetRow } from '@/lib/payroll/timesheetRow';
import { loadAttendanceDayCounts } from '@/lib/payroll/regularDays';
import { resolveDayType, teamLabel } from '@/lib/payroll/teamWeekOff';
import { loadTeamResolver, loadWeekOffConfig } from '@/lib/payroll/weekOffConfig';

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
  const denied = await requirePermission('view_timesheet');
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

    // Applicable / Absent days for everyone in one pass — Regular Days is calculated from these (computeRegularDays).
    const dayCounts = await loadAttendanceDayCounts(prisma, employees, year, month);

    const rows = await Promise.all(
      employees.map((emp) =>
        buildTimesheetRow(prisma, {
          employee: emp,
          periodStart: start,
          periodEnd: end,
          entry: entryByEmployee.get(emp.id),
          holidays,
          loanDeduction: loanDeductionByEmployee.get(emp.id) || 0,
          dayCounts: dayCounts.get(emp.id)!,
        })
      )
    );

    // The day strip's week-offs, for whoever is viewing: their own team's
    // alternate Saturdays / carry-forwards / Common Working Saturdays (or
    // the company Saturday policy with no team) — the same rule as their
    // attendance. The Timesheet table itself is per-employee as before.
    const session = await getServerSession(authOptions);
    const viewerUserId = session?.user ? parseInt((session.user as any).id, 10) : NaN;
    const viewer = Number.isFinite(viewerUserId) ? employees.find((e) => e.userId === viewerUserId) ?? null : null;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const [weekOffConfig, teamOf] = await Promise.all([
      loadWeekOffConfig(prisma),
      loadTeamResolver(prisma, viewer ? [viewer] : [], `${monthStr}-01`, `${monthStr}-${String(lastDay).padStart(2, '0')}`),
    ]);
    const viewerWeekOffs: { date: string; note: string | null }[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const day = `${monthStr}-${String(d).padStart(2, '0')}`;
      const t = resolveDayType(day, viewer ? teamOf(viewer.id, day) : null, weekOffConfig);
      if (t.weekOff) viewerWeekOffs.push({ date: day, note: t.note });
    }
    const viewerTeam = viewer ? teamOf(viewer.id, `${monthStr}-${String(lastDay).padStart(2, '0')}`) : null;

    return NextResponse.json({
      viewer: { team: viewerTeam, teamLabel: teamLabel(viewerTeam), weekOffs: viewerWeekOffs },
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

// Upserts one employee's Overtime days and/or Regular Days edit for a
// period. Regular Days is calculated (computeRegularDays); regularDaysOverride
// replaces it (null clears the edit, back to the calculated value). Only the
// fields sent are changed. Blocked once
// that period has been "Send to Payroll"'d (TimesheetPeriod.status ===
// SUBMITTED) — same locked-while-submitted idea as Payslip line items only
// being editable while their run is DRAFT.
export async function PATCH(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('edit_timesheet');
  if (denied) return denied;

  try {
    const body = await request.json();
    const employeeId = parseInt(body.employeeId, 10);
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);
    if (!employeeId || !year || !month) {
      return NextResponse.json({ message: 'employeeId, year, and month are required' }, { status: 400 });
    }
    const data: { overtimeHours?: number; regularDaysOverride?: number | null } = {};
    if (body.overtimeHours !== undefined) {
      const overtimeHours = body.overtimeHours != null ? Number(body.overtimeHours) : 0;
      if (!Number.isFinite(overtimeHours) || overtimeHours < 0) {
        return NextResponse.json({ message: 'Overtime days must be a non-negative number' }, { status: 400 });
      }
      data.overtimeHours = overtimeHours;
    }
    if (body.regularDaysOverride !== undefined) {
      if (body.regularDaysOverride === null || body.regularDaysOverride === '') data.regularDaysOverride = null;
      else {
        const v = Number(body.regularDaysOverride);
        if (!Number.isFinite(v) || v < 0 || v > 62) return NextResponse.json({ message: 'Regular days must be between 0 and 62' }, { status: 400 });
        data.regularDaysOverride = v;
      }
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ message: 'Nothing to update — send overtimeHours and/or regularDaysOverride' }, { status: 400 });

    const period = await prisma.timesheetPeriod.findUnique({ where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } } });
    if (period?.status === 'SUBMITTED') {
      return NextResponse.json({ message: 'This timesheet period has been sent to payroll — reopen it before editing' }, { status: 409 });
    }

    const session = await getServerSession(authOptions);
    const updatedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const entry = await prisma.timesheetEntry.upsert({
      where: { employeeId_periodYear_periodMonth: { employeeId, periodYear: year, periodMonth: month } },
      update: { ...data, updatedById: Number.isFinite(updatedById) ? updatedById : null },
      create: { employeeId, periodYear: year, periodMonth: month, ...data, updatedById: Number.isFinite(updatedById) ? updatedById : null },
    });

    await logAudit({
      action: 'UPDATE',
      entityType: 'TIMESHEET_ENTRY',
      entityId: entry.id,
      newValue: data,
      description: `Timesheet for employee ${employeeId}, ${month}/${year}: `
        + [
          data.overtimeHours !== undefined ? `overtime ${data.overtimeHours} day(s)` : null,
          data.regularDaysOverride !== undefined ? (data.regularDaysOverride === null ? 'Regular Days edit cleared (calculated value)' : `Regular Days set to ${data.regularDaysOverride}`) : null,
        ].filter(Boolean).join(', '),
      request,
    });

    return NextResponse.json(entry);
  } catch (error: any) {
    console.error('PATCH /api/payroll/timesheet error:', error);
    return NextResponse.json({ message: error.message || 'Failed to save timesheet entry' }, { status: 400 });
  }
}
