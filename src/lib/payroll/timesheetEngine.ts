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
  ptoHours: number;
}

interface LeaveRequestForHours extends LeaveOverlapInput {
  leaveType: { code: string; isPaid: boolean };
}

// Turns APPROVED leave requests into two of the timesheet's hour columns.
// Only paid leave types count — Sick (code SICK) is its own column, every
// other paid type (Casual, Earned, ...) rolls up into PTO. Unpaid leave
// (LOP) is excluded entirely: it already reduces payableDays elsewhere via
// computeAutoLopDays rather than counting as paid hours here.
export function computeLeaveHoursFromRequests(requests: LeaveRequestForHours[], periodStart: Date, periodEnd: Date): LeaveHours {
  let sickDays = 0;
  let ptoDays = 0;
  for (const r of requests) {
    if (!r.leaveType.isPaid) continue;
    const days = clippedDays(r, periodStart, periodEnd);
    if (r.leaveType.code === 'SICK') sickDays += days;
    else ptoDays += days;
  }
  return { sickLeaveHours: round2(sickDays * HOURS_PER_DAY), ptoHours: round2(ptoDays * HOURS_PER_DAY) };
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

// The same "Total Days" formula the Timesheet screen's own column computes
// (GET /api/payroll/timesheet) — pulled out as a pure function so payroll
// generation's own zero-days business rule (see generateRunPayslips) reads
// off the exact same number the user sees on that screen, rather than a
// second, independently-maintained formula that could drift out of sync
// with it. Takes the already-resolved hour breakdown (regularHours/
// overtimeHours from the period's TimesheetEntry, sickLeaveHours/ptoHours/
// paidHolidayHours from computeLeaveHours/computePaidHolidayHours above) —
// every caller already has to fetch/compute those for its own purposes
// anyway, so this stays a plain sync calculation instead of re-querying.
export function computeTotalDaysFromHours(regularHours: number, overtimeHours: number, sickLeaveHours: number, ptoHours: number, paidHolidayHours: number): number {
  const otherDays = (sickLeaveHours + ptoHours + paidHolidayHours) / HOURS_PER_DAY;
  return round2(regularHours + overtimeHours + otherDays);
}
