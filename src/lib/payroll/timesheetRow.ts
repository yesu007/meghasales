import { Employee, Prisma, PrismaClient } from '@prisma/client';
import { computeLeaveHours, computePaidHolidayHours, computeRegularDays, computeTotalDays, effectiveRegularDays } from './timesheetEngine';
import type { AttendanceDayCounts } from './regularDays';
import { computeAutoLopDays } from './leaveEngine';
import { round2 } from './runEngine';
import { resolveShiftForEmployeeOnDate } from './shiftEngine';

type Client = Prisma.TransactionClient | PrismaClient;

export interface TimesheetRow {
  employeeId: number;
  employeeCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  employmentType: string;
  status: string;
  timesheetStatus: string;
  regularHours: number;
  overtimeHours: number;
  sickLeaveHours: number;
  ptoHours: number;
  paidHolidayHours: number;
  earnedLeaveHours: number;
  lopDays: number;
  totalDays: number;
  // Regular Days breakdown (see computeRegularDays): applicable days − absent − LOP; Total = Regular + overtime.
  applicableDays: number;
  absentDays: number;
  weekOffWorkedDays: number; // week offs worked (login + logout), added to Regular
  holidayWorkedDays: number; // paid holidays worked (login + logout), added to Regular
  calculatedRegularDays: number; // before any HR edit
  regularOverridden: boolean; // regularHours is HR's edit (TimesheetEntry.regularDaysOverride)
  loanDeduction: number;
  shiftName: string | null;
  team: string | null; // TEAM_A | TEAM_B as of the period's last day — same convention as shiftName
}

interface TimesheetRowInput {
  employee: Employee;
  periodStart: Date;
  periodEnd: Date;
  // This employee's TimesheetEntry for the period, if one's been entered.
  entry: { regularHours: Prisma.Decimal | number; overtimeHours: Prisma.Decimal | number; regularDaysOverride?: Prisma.Decimal | number | null } | null | undefined;
  // Active company holidays already filtered to the period.
  holidays: { date: Date }[];
  // Sum of this employee's LoanRepayment amounts for the period.
  loanDeduction: number;
  // Applicable / Absent days for the period (loadAttendanceDayCounts), batched by the caller.
  dayCounts: AttendanceDayCounts;
}

// One Timesheet row — the exact per-employee figures Payroll → Time &
// Attendance → Timesheet shows (GET /api/payroll/timesheet), pulled out so
// My Space → Attendance (GET /api/payroll/my-attendance) reads off the same
// computation instead of a second copy that could drift out of sync. The
// caller batches the period-wide lookups (entries, holidays, loan
// repayments) so the Timesheet screen still makes one query per table for
// every employee rather than one per employee.
export async function buildTimesheetRow(tx: Client, { employee: emp, periodStart: start, periodEnd: end, entry, holidays, loanDeduction, dayCounts }: TimesheetRowInput): Promise<TimesheetRow> {
  // Overtime is the one figure HR still enters (in days); Regular is calculated below.
  const overtimeHours = entry ? Number(entry.overtimeHours) : 0;
  const { sickLeaveHours, ptoHours, earnedLeaveHours, paidHolidayLeaveHours } = await computeLeaveHours(tx, emp.id, start, end);
  // Paid Holiday combines two independent sources into one column: the
  // company holiday calendar (companyHolidayHours) and any of this
  // employee's own APPROVED "Paid Holidays" leave requests
  // (paidHolidayLeaveHours) — either one alone should show up here.
  const companyHolidayHours = computePaidHolidayHours(holidays, start, end, emp);
  const paidHolidayHours = round2(companyHolidayHours + paidHolidayLeaveHours);

  // Shift Master — resolved independently of the hours/leave figures
  // above. Shift is looked up as of the period's last day (same
  // "which assignment governs this period" convention
  // SalaryStructureAssignment already uses) — shown here purely for
  // visibility, no bearing on lopDays/totalDays.
  const shift = await resolveShiftForEmployeeOnDate(tx, emp.id, end);

  const lopDays = await computeAutoLopDays(tx, emp.id, start, end);
  // Regular Days = (applicable days − Absent) − LOP; Total Days = Regular +
  // Overtime — Sick/Casual/Earned/Paid Holiday are already inside the
  // applicable days and only shown in their own columns. See
  // computeRegularDays / computeTotalDays.
  // HR can edit Regular Days (Payroll → Time & Attendance); the edit wins.
  const calculatedRegularDays = computeRegularDays({ applicableDays: dayCounts.applicableDays, absentDays: dayCounts.absentDays, lopDays, weekOffWorkedDays: dayCounts.weekOffWorkedDays, holidayWorkedDays: dayCounts.holidayWorkedDays });
  const override = entry?.regularDaysOverride != null ? Number(entry.regularDaysOverride) : null;
  const regularHours = effectiveRegularDays(calculatedRegularDays, override);
  const totalDays = computeTotalDays(regularHours, overtimeHours);

  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    name: `${emp.firstName} ${emp.lastName}`,
    department: emp.department,
    designation: emp.designation,
    employmentType: emp.employmentType,
    status: emp.status,
    timesheetStatus: emp.timesheetStatus,
    regularHours,
    overtimeHours,
    sickLeaveHours,
    ptoHours,
    paidHolidayHours,
    earnedLeaveHours,
    lopDays,
    totalDays,
    applicableDays: dayCounts.applicableDays,
    absentDays: dayCounts.absentDays,
    weekOffWorkedDays: dayCounts.weekOffWorkedDays,
    holidayWorkedDays: dayCounts.holidayWorkedDays,
    calculatedRegularDays,
    regularOverridden: override != null,
    loanDeduction,
    shiftName: shift?.name ?? null,
    team: dayCounts.team,
  };
}
