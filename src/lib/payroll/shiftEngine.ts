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
