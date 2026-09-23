import dayjs from 'dayjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { round2 } from './runEngine';

type Client = Prisma.TransactionClient | PrismaClient;

export const HOURS_PER_DAY = 8;

export function periodRange(year: number, month: number): { start: Date; end: Date } {
  const first = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  return { start: first.startOf('month').toDate(), end: first.endOf('month').toDate() };
}

// Re-exported so existing server-side consumers of this module don't need a
// second import — the "isWeeklyOff needs no Prisma" split lives in
// saturdayPolicy.ts, which the Time & Attendance client page imports
// directly instead, to keep @prisma/client out of its browser bundle.
export { isWeeklyOff, type SaturdayPolicy } from './saturdayPolicy';

interface LeaveOverlapInput {
  startDate: Date;
  endDate: Date;
  days: Prisma.Decimal | number | string;
}

// Same overlap-clipping approach as computeAutoLopDaysFromRequests in
// leaveEngine.ts — a request spanning a period boundary only contributes the
// share of its days that actually falls inside this period, assuming days
// are spread evenly across the request's date span.
function clippedDays(r: LeaveOverlapInput, periodStart: Date, periodEnd: Date): number {
  const start = dayjs(periodStart);
  const end = dayjs(periodEnd);
  const reqStart = dayjs(r.startDate);
  const reqEnd = dayjs(r.endDate);
  const overlapStart = reqStart.isAfter(start) ? reqStart : start;
  const overlapEnd = reqEnd.isBefore(end) ? reqEnd : end;
  if (overlapEnd.isBefore(overlapStart)) return 0;

  const totalSpanDays = reqEnd.diff(reqStart, 'day') + 1;
  if (totalSpanDays <= 0) return 0;
  const overlapDays = overlapEnd.diff(overlapStart, 'day') + 1;
  return Number(r.days) * (overlapDays / totalSpanDays);
}

export interface LeaveHours {
  sickLeaveHours: number;
  ptoHours: number; // Casual Leave specifically — see the loop below
  earnedLeaveHours: number;
  paidHolidayLeaveHours: number; // approved "Paid Holidays" leave (code MATERNITY) — added to the company holiday calendar's own hours in the API route to form the Timesheet's single Paid Holiday column
}

interface LeaveRequestForHours extends LeaveOverlapInput {
  leaveType: { code: string; isPaid: boolean };
}

// Turns APPROVED leave requests into four of the timesheet's hour columns —
// Sick (code SICK), PTO/Casual (code CASUAL), Earned (code EARNED), and
// Paid Holiday (code MATERNITY — the leave type is displayed as "Paid
// Holidays" but keeps this stable code) each get their own column. Unpaid
// leave (LOP) is excluded entirely here — it already reduces payableDays
// elsewhere via computeAutoLopDays rather than counting as paid hours.
export function computeLeaveHoursFromRequests(requests: LeaveRequestForHours[], periodStart: Date, periodEnd: Date): LeaveHours {
  let sickDays = 0;
  let casualDays = 0;
  let earnedDays = 0;
  let paidHolidayLeaveDays = 0;
  for (const r of requests) {
    if (!r.leaveType.isPaid) continue;
    const days = clippedDays(r, periodStart, periodEnd);
    if (r.leaveType.code === 'SICK') sickDays += days;
    else if (r.leaveType.code === 'CASUAL') casualDays += days;
    else if (r.leaveType.code === 'EARNED') earnedDays += days;
    else if (r.leaveType.code === 'MATERNITY') paidHolidayLeaveDays += days;
  }
  return {
    sickLeaveHours: round2(sickDays * HOURS_PER_DAY),
    ptoHours: round2(casualDays * HOURS_PER_DAY),
    earnedLeaveHours: round2(earnedDays * HOURS_PER_DAY),
    paidHolidayLeaveHours: round2(paidHolidayLeaveDays * HOURS_PER_DAY),
  };
}

export async function computeLeaveHours(tx: Client, employeeId: number, periodStart: Date, periodEnd: Date): Promise<LeaveHours> {
  const requests = await tx.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'APPROVED',
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    include: { leaveType: { select: { code: true, isPaid: true } } },
  });
  return computeLeaveHoursFromRequests(requests, periodStart, periodEnd);
}

interface HolidayInput {
  date: Date;
}
interface EmploymentWindow {
  dateOfJoining: Date | null;
  dateOfLeaving: Date | null;
}

// 8h per company holiday that falls inside both the period and the
// employee's employment window — someone who joined mid-month isn't
// credited paid-holiday hours for a holiday before their first day.
export function computePaidHolidayHours(holidays: HolidayInput[], periodStart: Date, periodEnd: Date, employee: EmploymentWindow): number {
  const start = dayjs(periodStart);
  const end = dayjs(periodEnd);
  const joined = employee.dateOfJoining ? dayjs(employee.dateOfJoining) : null;
  const left = employee.dateOfLeaving ? dayjs(employee.dateOfLeaving) : null;

  const count = holidays.filter((h) => {
    const d = dayjs(h.date);
    if (d.isBefore(start, 'day') || d.isAfter(end, 'day')) return false;
    if (joined && d.isBefore(joined, 'day')) return false;
    if (left && d.isAfter(left, 'day')) return false;
    return true;
  }).length;

  return round2(count * HOURS_PER_DAY);
}

// Leave type codes excluded from "Other Leave Days" in the Total Days
// formula below: Earned Leave (no add, no subtract — it's still shown as
// its own informational column but never touches Total Days) and Loss of
// Pay (subtracted separately via `lopDays`, already computed elsewhere via
// computeAutoLopDays — including it here too would double-count it).
// Exclusion-based, not an inclusion list, at the requester's explicit
// direction — mirrors countsTowardAnnualLeave in leaveEngine.ts: any leave
// type added later (Casual, Sick, Paid Holidays, or a brand new one) is
// included in Other Leave Days by default unless its code is added here.
export const TOTAL_DAYS_EXCLUDED_CODES = ['EARNED', 'LOP'];

interface LeaveRequestForOtherDays extends LeaveOverlapInput {
  leaveType: { code: string };
}

// Sums clipped days, across every APPROVED leave request overlapping the
// period, for every leave type except the two above — the "Other Leave
// Days" term Total Days adds. Deliberately separate from
// computeLeaveHoursFromRequests: that function only buckets the four named
// display columns (Sick/PTO/Earned/Paid Holiday) and would silently drop a
// leave type it doesn't recognize, whereas this one must count every leave
// type generically so a brand new one is included automatically.
export function computeOtherLeaveDaysFromRequests(requests: LeaveRequestForOtherDays[], periodStart: Date, periodEnd: Date): number {
  let days = 0;
  for (const r of requests) {
    if (TOTAL_DAYS_EXCLUDED_CODES.includes(r.leaveType.code)) continue;
    days += clippedDays(r, periodStart, periodEnd);
  }
  return round2(days);
}

export async function computeOtherLeaveDays(tx: Client, employeeId: number, periodStart: Date, periodEnd: Date): Promise<number> {
  const requests = await tx.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'APPROVED',
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    include: { leaveType: { select: { code: true } } },
  });
  return computeOtherLeaveDaysFromRequests(requests, periodStart, periodEnd);
}

// The same "Total Days" formula the Timesheet screen's own column computes
// (GET /api/payroll/timesheet) — pulled out as a pure function so the
// "Send To Payroll" zero-days business rule (see timesheet/submit/route.ts)
// and the actual payroll proration (see runService.ts) all read off the
// exact same number the user sees on that screen, rather than a second,
// independently-maintained formula that could drift out of sync with it.
// `otherLeaveDays` (every leave type except Earned/LOP — see
// computeOtherLeaveDays above) adds to this figure; `paidHolidayDays` is
// the company holiday calendar's own contribution (computePaidHolidayHours
// / HOURS_PER_DAY) — deliberately NOT the combined Paid Holiday column
// shown on screen, since that column also folds in APPROVED "Paid
// Holidays" leave requests (code MATERNITY), which are already counted via
// otherLeaveDays above; adding the combined figure here would double-count
// that portion. `lopDays` (already in days — see computeAutoLopDays in
// leaveEngine.ts, already clipped to this period) subtracts; Earned Leave,
// tracked in its own informational column, never touches it either way.
export function computeTotalDaysFromHours(regularHours: number, overtimeHours: number, otherLeaveDays: number, lopDays: number, paidHolidayDays: number = 0): number {
  return round2(regularHours + overtimeHours + otherLeaveDays + paidHolidayDays - lopDays);
}
