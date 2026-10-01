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

// Codes the Sick and PTO/Casual columns recognise: the seeded code plus the
// "<NAME>_LEAVE" form a type gets when it's created as "Sick Leave" /
// "Casual Leave" via Time-off Policy (the code there is free text and can't
// be edited afterwards), so either one lands in its column.
export const SICK_LEAVE_CODES = ['SICK', 'SICK_LEAVE'];
export const CASUAL_LEAVE_CODES = ['CASUAL', 'CASUAL_LEAVE'];

// Turns APPROVED leave requests into four of the timesheet's hour columns —
// Sick (SICK_LEAVE_CODES), PTO/Casual (CASUAL_LEAVE_CODES), Earned (code EARNED), and
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
    if (SICK_LEAVE_CODES.includes(r.leaveType.code)) sickDays += days;
    else if (CASUAL_LEAVE_CODES.includes(r.leaveType.code)) casualDays += days;
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

// Total Days rule: LOP is the only leave that reduces Total Days, and
// Paid Holidays are the only leave that adds to it. Every other leave type
// (Sick, Casual/PTO, Earned, any new one) is shown in its own column only
// and never touches Total Days. "Paid Holidays" here is the leave-request
// half of the Paid Holiday column — the leave type with code MATERNITY
// (see computeLeaveHoursFromRequests, which fills that column from the same
// code); the other half, the company holiday calendar, is passed to
// computeTotalDaysFromHours separately.
export const TOTAL_DAYS_ADDED_LEAVE_CODES = ['MATERNITY'];

interface LeaveRequestForPaidHolidayDays extends LeaveOverlapInput {
  leaveType: { code: string };
}

// Sums clipped days, across every APPROVED leave request overlapping the
// period, for the Paid Holidays leave type only — the leave term Total
// Days adds.
export function computePaidHolidayLeaveDaysFromRequests(requests: LeaveRequestForPaidHolidayDays[], periodStart: Date, periodEnd: Date): number {
  let days = 0;
  for (const r of requests) {
    if (!TOTAL_DAYS_ADDED_LEAVE_CODES.includes(r.leaveType.code)) continue;
    days += clippedDays(r, periodStart, periodEnd);
  }
  return round2(days);
}

export async function computePaidHolidayLeaveDays(tx: Client, employeeId: number, periodStart: Date, periodEnd: Date): Promise<number> {
  const requests = await tx.leaveRequest.findMany({
    where: {
      employeeId,
      status: 'APPROVED',
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart },
    },
    include: { leaveType: { select: { code: true } } },
  });
  return computePaidHolidayLeaveDaysFromRequests(requests, periodStart, periodEnd);
}

// Regular Days and Total Days — the Timesheet day counts on Payroll → Time
// & Attendance and My Space → Attendance (also the "Send To Payroll"
// zero-days gate and payroll eligibility):
//
//   Regular Days = Eligible Days − LOP + worked week-off days + worked holidays
//   Eligible Days = the employee's applicable days in the period − Absent
//   Total Days   = Regular Days + Overtime
//
// Applicable days are every day in the period (within their joining/
// leaving dates) that isn't their week off — so worked days, Sick / Casual
// / Earned / other paid leave and Paid Holidays are all already inside it
// and are only *displayed* in their own columns, never added or deducted
// again. Absent days (from attendance) don't count. LOP (unpaid leave, in
// days — see computeAutoLopDays) is the only leave that deducts. A week off
// the employee actually worked (login AND logout, shown as Present ·
// worked on week off) adds 1 — it isn't in the applicable days. A Paid
// Holiday worked the same way also adds 1, on top of the holiday itself
// (which is already an applicable day). A holiday on a week off counts
// once. Overtime
// (days, entered by HR) is added on top in Total Days. Never below 0. See
// regularDays.ts for how the inputs are gathered.
export interface RegularDaysInput {
  applicableDays: number;
  absentDays: number;
  lopDays: number;
  weekOffWorkedDays?: number; // week offs worked with login + logout
  holidayWorkedDays?: number; // paid holidays worked with login + logout (not on a week off)
}

export function computeRegularDays({ applicableDays, absentDays, lopDays, weekOffWorkedDays = 0, holidayWorkedDays = 0 }: RegularDaysInput): number {
  return Math.max(0, round2(applicableDays - absentDays - lopDays + weekOffWorkedDays + holidayWorkedDays));
}

export function computeTotalDays(regularDays: number, overtimeDays: number): number {
  return round2(regularDays + overtimeDays);
}

// Regular Days after HR's manual edit (TimesheetEntry.regularDaysOverride):
// the override when there is one, else the calculated value.
export function effectiveRegularDays(calculated: number, override: number | null | undefined): number {
  return override != null ? Math.max(0, round2(override)) : calculated;
}

// Paid days for the payroll run: calendar days in the employee's window
// minus LOP (computePayableDays) minus Absent — week offs and paid
// holidays stay paid — plus however many days HR's Regular Days edit
// moved from the calculated value. Never below 0 or above the month.
export function computePaidDays({ calendarPayableDays, absentDays, calculatedRegular, overrideRegular, monthDays }: {
  calendarPayableDays: number;
  absentDays: number;
  calculatedRegular: number;
  overrideRegular: number | null | undefined;
  monthDays: number;
}): number {
  const adjustment = overrideRegular != null ? effectiveRegularDays(calculatedRegular, overrideRegular) - calculatedRegular : 0;
  return Math.min(monthDays, Math.max(0, round2(calendarPayableDays - absentDays + adjustment)));
}
