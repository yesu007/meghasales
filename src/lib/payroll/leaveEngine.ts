import dayjs from 'dayjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { round2 } from './runEngine';

type Client = Prisma.TransactionClient | PrismaClient;

interface LeaveRequestForLop {
  startDate: Date;
  endDate: Date;
  days: Prisma.Decimal | number | string;
}

// Clips each request's date range to the pay period and takes the
// overlap's share of its total days — a request spanning a month
// boundary contributes only the portion that actually falls in this
// period. Assumes days are spread evenly across the request's date span,
// which is exact for a request entirely inside one period and a
// reasonable approximation for one that isn't.
export function computeAutoLopDaysFromRequests(requests: LeaveRequestForLop[], periodStart: Date, periodEnd: Date): number {
  let lopDays = 0;
  const start = dayjs(periodStart);
  const end = dayjs(periodEnd);

  for (const r of requests) {
    const reqStart = dayjs(r.startDate);
    const reqEnd = dayjs(r.endDate);
    const overlapStart = reqStart.isAfter(start) ? reqStart : start;
    const overlapEnd = reqEnd.isBefore(end) ? reqEnd : end;
    if (overlapEnd.isBefore(overlapStart)) continue; // no actual overlap

    const totalSpanDays = reqEnd.diff(reqStart, 'day') + 1;
    const overlapDays = overlapEnd.diff(overlapStart, 'day') + 1;
    if (totalSpanDays <= 0) continue;

    lopDays += Number(r.days) * (overlapDays / totalSpanDays);
  }

  return round2(lopDays);
}

// Only APPROVED requests against an unpaid (isPaid: false) leave type
// count as LOP — a paid leave type (Casual/Sick/Earned) means the
// employee is absent but still gets paid for those days, so it must NOT
// reduce payableDays the way an actual LOP day does.
export async function computeAutoLopDays(tx: Client, employeeId: number, periodStart: Date, periodEnd: Date): Promise<number> {
  const requests = await tx.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'APPROVED',
      leaveType: { isPaid: false },
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
  });
  return computeAutoLopDaysFromRequests(requests, periodStart, periodEnd);
}

// --- Common paid-leave pool ---------------------------------------------
// Any leave type code listed here draws from ONE combined 12-day annual
// paid leave entitlement that accrues at 1 day per elapsed calendar month
// (capped at 12) rather than being available in full from January, instead
// of carrying its own independent annual quota. Each type's own
// `annualQuota` column is intentionally left untouched in the database but
// ignored in the balance calculation for a code listed here — it's
// superseded by the formula below. Any OTHER leave type that carries its
// own `annualQuota` (Annual Leave included — deliberately standalone, not
// pooled) keeps the old, unrelated per-type quota check in the POST
// handler instead. Loss of Pay and any dedicated Paid Leave category (e.g.
// Maternity Leave) are always excluded from this pool.
//
// Originally Casual Leave and Sick Leave were pool members alongside
// Earned Leave; both were removed as leave types entirely (replaced by a
// standalone Annual Leave), leaving Earned Leave as the pool's only
// current member — kept pooled (rather than reverted to its own instant
// 12-day quota) since nothing asked for that member's own behavior to
// change.
export const COMMON_POOL_LEAVE_CODES = ['EARNED'];
export const COMMON_POOL_ANNUAL_DAYS = 12;
export const COMMON_POOL_MONTHLY_ACCRUAL = 1;

// Days accrued toward the common pool for `year`, as of `asOf` (defaults to
// now). A past year is treated as fully accrued (12); a future year hasn't
// started accruing yet (0) — only the current year accrues month by month.
export function computeAccruedPoolDays(year: number, asOf: Date = new Date()): number {
  const currentYear = asOf.getFullYear();
  if (year < currentYear) return COMMON_POOL_ANNUAL_DAYS;
  if (year > currentYear) return 0;
  const monthsElapsed = asOf.getMonth() + 1; // January = 1 month accrued, not 0
  return Math.min(COMMON_POOL_ANNUAL_DAYS, monthsElapsed * COMMON_POOL_MONTHLY_ACCRUAL);
}

export interface DepartmentOverlapColleague {
  employeeId: number;
  name: string;
  status: string;
}

// Flags when a leave request shares its dates with one or more OTHER
// employees in the same department who are already PENDING/APPROVED for
// that window — e.g. two of three testers out the same week. department
// is matched exactly (it's free-text on Employee, not an enum) and a
// null/blank department never matches anything, since there's no group to
// cross-check against. Used both at apply-time (to notify the applier and
// every approve_leave holder) and on the approval queue (to flag it for
// whoever is about to decide).
export async function findOverlappingDepartmentColleagues(
  tx: Client,
  department: string,
  employeeId: number,
  startDate: Date,
  endDate: Date
): Promise<DepartmentOverlapColleague[]> {
  const rows = await tx.leaveRequest.findMany({
    where: {
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      employee: { id: { not: employeeId }, department },
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
  });

  const seen = new Map<number, DepartmentOverlapColleague>();
  for (const r of rows) {
    if (!seen.has(r.employee.id)) {
      seen.set(r.employee.id, { employeeId: r.employee.id, name: `${r.employee.firstName} ${r.employee.lastName}`, status: r.status });
    }
  }
  return Array.from(seen.values());
}
