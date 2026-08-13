import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { periodRange, computeLeaveHours, computePaidHolidayHours } from '@/lib/payroll/timesheetEngine';
import { round2 } from '@/lib/payroll/runEngine';

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

    const rows = await Promise.all(
      employees.map(async (emp) => {
        const entry = entryByEmployee.get(emp.id);
        const regularHours = entry ? Number(entry.regularHours) : 0;
        const overtimeHours = entry ? Number(entry.overtimeHours) : 0;
        const { sickLeaveHours, ptoHours } = await computeLeaveHours(prisma, emp.id, start, end);
        const paidHolidayHours = computePaidHolidayHours(holidays, start, end, emp);
        const totalHours = round2(regularHours + overtimeHours + sickLeaveHours + ptoHours + paidHolidayHours);

        return {
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          name: `${emp.firstName} ${emp.lastName}`,
          department: emp.department,
          designation: emp.designation,
          employmentType: emp.employmentType,
          status: emp.status,
          regularHours,
          overtimeHours,
          sickLeaveHours,
          ptoHours,
          paidHolidayHours,
          totalHours,
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
      return NextResponse.json({ message: 'Hours must be non-negative numbers' }, { status: 400 });
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
      description: `Timesheet hours for employee ${employeeId}, ${month}/${year} set to ${regularHours}h regular / ${overtimeHours}h overtime`,
      request,
    });

    return NextResponse.json(entry);
  } catch (error: any) {
    console.error('PATCH /api/payroll/timesheet error:', error);
    return NextResponse.json({ message: error.message || 'Failed to save timesheet entry' }, { status: 400 });
  }
}
