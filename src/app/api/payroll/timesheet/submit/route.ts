import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { periodRange, computeOtherLeaveDays, computeTotalDaysFromHours, computePaidHolidayHours, HOURS_PER_DAY } from '@/lib/payroll/timesheetEngine';
import { computeAutoLopDays } from '@/lib/payroll/leaveEngine';
import { round2 } from '@/lib/payroll/runEngine';

export const dynamic = 'force-dynamic';

// "Send To Payroll" / "Reopen" — a two-state toggle on TimesheetPeriod, the
// same one-step-reversible convention PayrollRun uses for its own status
// rather than a one-way pipeline. run_payroll (not manage_employees) since
// this is the "hand this period off to payroll processing" action, the same
// permission tier that generates a PayrollRun itself.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('run_payroll');
  if (denied) return denied;

  try {
    const body = await request.json();
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);
    const toStatus = body.status === 'OPEN' ? 'OPEN' : 'SUBMITTED';
    if (!year || !month) return NextResponse.json({ message: 'year and month are required' }, { status: 400 });

    // Business rule, checked only on "Send To Payroll" (not on Reopen): an
    // employee whose own Timesheet Status is Active must have logged some
    // Total Days before this period can be handed off — an Inactive
    // employee is exempt even at 0 days, and anyone with Total Days > 0 is
    // unaffected. Same "Total Days" this period's own table column shows
    // (computeTotalDaysFromHours — see its own comment for why this reads
    // off the exact same formula rather than a second one that could drift).
    // Blocks the WHOLE submission rather than skipping just the offending
    // employees — unlike payroll generation, submitting a period isn't a
    // per-employee action, so there's no per-employee "still submit the
    // rest" to fall back to; the fix is to enter their hours or mark them
    // Inactive, then submit again.
    if (toStatus === 'SUBMITTED') {
      const { start, end } = periodRange(year, month);
      const [employees, entries, holidays] = await Promise.all([
        prisma.employee.findMany(),
        prisma.timesheetEntry.findMany({ where: { periodYear: year, periodMonth: month } }),
        prisma.paidHoliday.findMany({ where: { isActive: true, date: { gte: start, lte: end } } }),
      ]);
      const entryByEmployee = new Map(entries.map((e) => [e.employeeId, e]));

      const zeroDayActiveEmployees: string[] = [];
      for (const emp of employees) {
        if (emp.timesheetStatus !== 'ACTIVE') continue;
        const entry = entryByEmployee.get(emp.id);
        const regularHours = entry ? Number(entry.regularHours) : 0;
        const overtimeHours = entry ? Number(entry.overtimeHours) : 0;
        const lopDays = await computeAutoLopDays(prisma, emp.id, start, end);
        const otherLeaveDays = await computeOtherLeaveDays(prisma, emp.id, start, end);
        const paidHolidayDays = round2(computePaidHolidayHours(holidays, start, end, emp) / HOURS_PER_DAY);
        const totalDays = computeTotalDaysFromHours(regularHours, overtimeHours, otherLeaveDays, lopDays, paidHolidayDays);
        if (totalDays === 0) zeroDayActiveEmployees.push(`${emp.firstName} ${emp.lastName}`);
      }

      if (zeroDayActiveEmployees.length > 0) {
        return NextResponse.json(
          {
            message: `Payroll cannot be generated for an Active employee with 0 Total Days. Fix or mark Inactive: ${zeroDayActiveEmployees.join(', ')}.`,
          },
          { status: 409 },
        );
      }
    }

    const session = await getServerSession(authOptions);
    const performedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const period = await prisma.timesheetPeriod.upsert({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      update:
        toStatus === 'SUBMITTED'
          ? { status: 'SUBMITTED', submittedById: Number.isFinite(performedById) ? performedById : null, submittedAt: new Date() }
          : { status: 'OPEN', submittedById: null, submittedAt: null },
      create: {
        periodYear: year,
        periodMonth: month,
        status: toStatus,
        submittedById: toStatus === 'SUBMITTED' && Number.isFinite(performedById) ? performedById : null,
        submittedAt: toStatus === 'SUBMITTED' ? new Date() : null,
      },
    });

    await logAudit({
      action: 'UPDATE',
      entityType: 'TIMESHEET_PERIOD',
      entityId: period.id,
      newValue: { status: period.status },
      description: `Timesheet for ${month}/${year} ${toStatus === 'SUBMITTED' ? 'sent to payroll' : 'reopened'}`,
      request,
    });

    return NextResponse.json(period);
  } catch (error: any) {
    console.error('POST /api/payroll/timesheet/submit error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update timesheet period' }, { status: 400 });
  }
}
