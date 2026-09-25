import { Employee, Prisma, PrismaClient } from '@prisma/client';
import { computeLeaveHours, computePaidHolidayHours, computePaidHolidayLeaveDays, computeTotalDaysFromHours, HOURS_PER_DAY } from './timesheetEngine';
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
  loanDeduction: number;
  shiftName: string | null;
}

interface TimesheetRowInput {
  employee: Employee;
  periodStart: Date;
  periodEnd: Date;
  // This employee's TimesheetEntry for the period, if one's been entered.
  entry: { regularHours: Prisma.Decimal | number; overtimeHours: Prisma.Decimal | number } | null | undefined;
  // Active company holidays already filtered to the period.
  holidays: { date: Date }[];
  // Sum of this employee's LoanRepayment amounts for the period.
  loanDeduction: number;
}

// One Timesheet row — the exact per-employee figures Payroll → Time &
// Attendance → Timesheet shows (GET /api/payroll/timesheet), pulled out so
// My Space → Attendance (GET /api/payroll/my-attendance) reads off the same
// computation instead of a second copy that could drift out of sync. The
// caller batches the period-wide lookups (entries, holidays, loan
// repayments) so the Timesheet screen still makes one query per table for
// every employee rather than one per employee.
export async function buildTimesheetRow(tx: Client, { employee: emp, periodStart: start, periodEnd: end, entry, holidays, loanDeduction }: TimesheetRowInput): Promise<TimesheetRow> {
  const regularHours = entry ? Number(entry.regularHours) : 0;
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
  // Regular/Overtime are entered directly as days (no 8-hours=1-day
  // conversion). Total Days = Regular + Overtime + Paid Holidays - LOP:
  // Paid Holidays is this row's Paid Holiday column in days (approved
  // Paid Holidays leave + company holiday calendar), LOP (already in days)
  // subtracts, and Sick/PTO/Earned are display-only — see
  // computeTotalDaysFromHours.
  const paidHolidayLeaveDays = await computePaidHolidayLeaveDays(tx, emp.id, start, end);
  const companyHolidayDays = round2(companyHolidayHours / HOURS_PER_DAY);
  const totalDays = computeTotalDaysFromHours(regularHours, overtimeHours, paidHolidayLeaveDays, lopDays, companyHolidayDays);

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
    loanDeduction,
    shiftName: shift?.name ?? null,
  };
}
