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

// --- Common paid-leave pool ("Annual Leave") ----------------------------
// Every leave type draws from ONE combined annual entitlement — branded
// "Annual Leave" wherever the combined balance is shown — that accrues
// month by month (capped at the entitlement) rather than being available
// in full from January, EXCEPT the codes below, which are excluded by
// design and must never reduce it. This is deliberately exclusion-based
// rather than an explicit list of included codes: any leave type added
// later automatically counts toward Annual Leave unless its code is added
// here too, so a new paid leave category doesn't silently escape the
// deduction by omission.
//   - LOP (Loss of Pay) — unpaid, already reduces payableDays elsewhere.
//   - EARNED (Earned Leave) — carries its own independent `annualQuota`
//     and is checked/tracked exactly like any other standalone quota'd
//     leave type (see the `annualQuota != null` branch below and in the
//     `mine` route).
//   - MATERNITY (displayed as "Paid Holidays" — the code is a legacy
//     handle, kept stable since leaveEngine.ts/timesheetEngine.ts key off
//     it) — has no quota of its own; usage is simply recorded.
//   - ANNUAL — not a leave type employees apply for; see
//     ANNUAL_LEAVE_CONFIG_CODE below, this is the entitlement's config row.
export const ANNUAL_LEAVE_EXCLUDED_CODES = ['LOP', 'EARNED', 'MATERNITY', 'ANNUAL'];

// Whether approved days against this leave type code should reduce the
// combined Annual Leave pool — true for every code except the excluded
// ones above.
export function countsTowardAnnualLeave(code: string): boolean {
  return !ANNUAL_LEAVE_EXCLUDED_CODES.includes(code);
}

// The stable code of the LeaveType row that configures the combined
// Annual Leave pool's entitlement — Time & Attendance > Time-off Policy
// (the Leave Types admin screen) is the source of truth: an
// admin creates/edits a leave type named "Annual Leave" there (code
// auto-derives to ANNUAL) and sets its Annual Quota to the company's
// actual entitlement (12, 15, 18, ...). Nothing about the entitlement
// number is hard-coded here — see getAnnualLeaveConfig below, which reads
// it live from that row every time, exactly like every other leave type's
// own `annualQuota` column already works (e.g. Earned Leave's).
export const ANNUAL_LEAVE_CONFIG_CODE = 'ANNUAL';

export interface AnnualLeaveConfig {
  annualDays: number;
}

// Reads the company's configured Annual Leave entitlement from the
// ANNUAL_LEAVE_CONFIG_CODE row, or null if it hasn't been configured yet
// (no such row, or its Annual Quota is blank) — callers must treat null as
// "not configured" and gracefully skip the combined-pool calculation
// entirely rather than falling back to any built-in default; there is no
// hard-coded entitlement number anywhere in this module.
export async function getAnnualLeaveConfig(tx: Client): Promise<AnnualLeaveConfig | null> {
  const row = await tx.leaveType.findFirst({ where: { code: ANNUAL_LEAVE_CONFIG_CODE } });
  if (!row || row.annualQuota == null) return null;
  return { annualDays: Number(row.annualQuota) };
}

// Days accrued toward the common pool for `year`, as of `asOf` (defaults to
// now), given the configured `annualDays` entitlement. Accrual is spread
// evenly across the 12 calendar months of that entitlement (annualDays/12
// per elapsed month — e.g. a 15-day entitlement accrues 1.25/month, not a
// fixed 1/month), so a company that configures a different entitlement
// automatically gets a proportionally different monthly accrual with no
// separate rate to configure. A past year is treated as fully accrued
// (annualDays); a future year hasn't started accruing yet (0) — only the
// current year accrues month by month.
export function computeAccruedPoolDays(annualDays: number, year: number, asOf: Date = new Date()): number {
  const currentYear = asOf.getFullYear();
  if (year < currentYear) return annualDays;
  if (year > currentYear) return 0;
  const monthsElapsed = asOf.getMonth() + 1; // January = 1 month accrued, not 0
  const monthlyAccrual = annualDays / 12;
  return round2(Math.min(annualDays, monthsElapsed * monthlyAccrual));
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

// --- Month-wise leave / LOP split -----------------------------------------
// A leave request is allocated date by date, in order: each date uses the
// paid balance available AS OF ITS OWN MONTH (that month's accrual counts;
// a later month's never covers an earlier date), and only what that balance
// can't cover becomes Loss of Pay. The request's `days` are spread evenly
// over its calendar dates (1 per date when days = the span, 0.5 for a
// half-day) — the same "even spread" convention clippedDays uses.
//
// The result is one segment per (month, paid-or-LOP), each with its own
// real dates — e.g. 30 Sep–10 Oct, 9 days available by October:
//   Sick 30 Sep (1) · Sick 1–8 Oct (8) · LOP 9–10 Oct (2)
// so the Timesheet, attendance and LOP all see exactly which dates are
// which, month by month.
export interface LeaveSegment {
  kind: 'PAID' | 'LOP';
  startDate: string; // YYYY-MM-DD
  endDate: string;
  days: number;
}

export interface LeaveAllocation {
  paidDays: number;
  lopDays: number;
  segments: LeaveSegment[];
  byMonth: { month: string; paidDays: number; lopDays: number }[]; // month = YYYY-MM
}

const isoDay = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

// `availableAsOf(day)` = paid days the employee can take for dates up to and
// including `day`'s month, before this request (e.g. accrued-by-that-month
// − already used that year). Tracked per calendar year, so a request that
// crosses into January starts on the new year's balance.
export function allocateLeaveByDate({ startDate, endDate, days, availableAsOf }: {
  startDate: string;
  endDate: string;
  days: number;
  availableAsOf: (day: string) => number;
}): LeaveAllocation {
  const start = dayjs(startDate);
  const span = dayjs(endDate).diff(start, 'day') + 1;
  const perDate = span > 0 ? days / span : 0;
  const assignedByYear = new Map<string, number>();
  const parts: { day: string; paid: number; lop: number }[] = [];
  for (let i = 0; i < span; i++) {
    const day = isoDay(start.add(i, 'day'));
    const year = day.slice(0, 4);
    const assigned = assignedByYear.get(year) || 0;
    const canPay = Math.max(0, availableAsOf(day) - assigned);
    const paid = round2(Math.min(perDate, canPay));
    const lop = round2(perDate - paid);
    assignedByYear.set(year, assigned + paid);
    parts.push({ day, paid, lop });
  }

  const segments: LeaveSegment[] = [];
  const months = new Map<string, { paidDays: number; lopDays: number }>();
  for (const kind of ['PAID', 'LOP'] as const) {
    const byMonth = new Map<string, LeaveSegment>();
    for (const p of parts) {
      const amount = kind === 'PAID' ? p.paid : p.lop;
      if (amount <= 0) continue;
      const month = p.day.slice(0, 7);
      const seg = byMonth.get(month);
      if (seg) { seg.endDate = p.day; seg.days = round2(seg.days + amount); }
      else byMonth.set(month, { kind, startDate: p.day, endDate: p.day, days: amount });
      const m = months.get(month) ?? { paidDays: 0, lopDays: 0 };
      if (kind === 'PAID') m.paidDays = round2(m.paidDays + amount); else m.lopDays = round2(m.lopDays + amount);
      months.set(month, m);
    }
    segments.push(...Array.from(byMonth.values()));
  }
  segments.sort((a, b) => (a.startDate === b.startDate ? (a.kind === 'PAID' ? -1 : 1) : a.startDate.localeCompare(b.startDate)));

  return {
    paidDays: round2(parts.reduce((s, p) => s + p.paid, 0)),
    lopDays: round2(parts.reduce((s, p) => s + p.lop, 0)),
    segments,
    byMonth: Array.from(months.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([month, m]) => ({ month, ...m })),
  };
}
