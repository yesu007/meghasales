import { Prisma, PrismaClient } from '@prisma/client';

type Client = Prisma.TransactionClient | PrismaClient;

export const ATTENDANCE_REQUIREMENTS = ['LOGIN_ONLY', 'LOGIN_AND_LOGOUT'] as const;
export type AttendanceRequirement = (typeof ATTENDANCE_REQUIREMENTS)[number];

// Resolves whichever EmployeeShiftAssignment was effective ON `date` — same
// "the row whose effectiveFrom/effectiveTo window contains this date, most
// recent effectiveFrom wins" lookup generateRunPayslips uses for
// SalaryStructureAssignment. A later re-assignment never changes what this
// returns for an earlier date.
export async function resolveShiftForEmployeeOnDate(tx: Client, employeeId: number, date: Date) {
  const assignment = await tx.employeeShiftAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    include: { shift: true },
  });
  return assignment?.shift ?? null;
}

// True once a shift assignment's own effective window has already been
// used to pay someone — walked month by month from effectiveFrom through
// effectiveTo (or today, for a still-open assignment), checking whether
// that period's PayrollRun has been committed (PROCESSED/PAID, same
// "committed" boundary applyOrReverseLoanRepayments in runService.ts uses)
// and this employee actually has a payslip on it. Edit/delete on the
// assignment route call this first so a correction can never silently
// change what an already-paid period was actually computed against —
// reopen that run back to DRAFT first if the assignment genuinely needs
// fixing.
export async function isShiftAssignmentUsedInClosedPayroll(tx: Client, employeeId: number, effectiveFrom: Date, effectiveTo: Date | null): Promise<boolean> {
  const rangeEnd = effectiveTo ?? new Date();
  let year = effectiveFrom.getUTCFullYear();
  let month = effectiveFrom.getUTCMonth() + 1;
  const endYear = rangeEnd.getUTCFullYear();
  const endMonth = rangeEnd.getUTCMonth() + 1;

  // Bounded to 100 years of months as a sanity cap — effectiveTo/today is
  // always a real, near-present date in practice, this just guards against
  // a corrupt/absurd date ever causing an unbounded loop.
  for (let guard = 0; guard < 1200 && (year < endYear || (year === endYear && month <= endMonth)); guard++) {
    const run = await tx.payrollRun.findUnique({ where: { payPeriodYear_payPeriodMonth: { payPeriodYear: year, payPeriodMonth: month } } });
    if (run && (run.status === 'PROCESSED' || run.status === 'PAID')) {
      const payslip = await tx.payslip.findUnique({ where: { runId_employeeId: { runId: run.id, employeeId } } });
      if (payslip) return true;
    }
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return false;
}

// Creates an employee's shift (and week-off team) assignment from
// `effectiveFrom`, closing their currently open assignment the day before —
// the one path both Shift Master → Employee Shift and Team Assignment and
// Employee onboarding (Shift dropdown) go through, so both produce the
// same mapping. The open assignment's team is the employee's current
// team, so Employee.weekOffTeam is kept in sync with it. Throws with a
// user-facing message when the dates don't fit.
export async function createShiftAssignment(
  tx: Client,
  { employeeId, shiftId, effectiveFrom, weekOffTeam, createdById }: { employeeId: number; shiftId: number; effectiveFrom: Date; weekOffTeam: string | null; createdById: number | null },
) {
  const openAssignment = await tx.employeeShiftAssignment.findFirst({
    where: { employeeId, effectiveTo: null },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (openAssignment && effectiveFrom <= openAssignment.effectiveFrom) {
    throw new Error(`The new assignment must start after the current one's start date (${openAssignment.effectiveFrom.toISOString().slice(0, 10)})`);
  }
  if (openAssignment) {
    const dayBefore = new Date(effectiveFrom);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    await tx.employeeShiftAssignment.update({ where: { id: openAssignment.id }, data: { effectiveTo: dayBefore } });
  }
  const assignment = await tx.employeeShiftAssignment.create({
    data: { employeeId, shiftId, effectiveFrom, weekOffTeam, createdById },
  });
  await tx.employee.update({ where: { id: employeeId }, data: { weekOffTeam } });
  return assignment;
}
