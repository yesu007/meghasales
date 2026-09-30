import { Prisma, PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import { isValidRunStatusTransition, RunStatus } from './constants';
import { computePayableDays, daysInMonth, resolveStructureLineItems, round2, StatutoryConfig } from './runEngine';
import { computeAutoLopDays } from './leaveEngine';
import { computePaidDays, computeRegularDays, computeTotalDays, effectiveRegularDays } from './timesheetEngine';
import { loadAttendanceDayCounts } from './regularDays';
import { nextExpenseNumber } from '@/lib/nextExpenseNumber';

export class OptimisticLockError extends Error {}
export class InvalidStatusTransitionError extends Error {}
export class RunNotEditableError extends Error {}

type Client = Prisma.TransactionClient | PrismaClient;

// Fetched once per run-generation/recalculation (not once per employee) —
// CompanyProfile is a singleton and PtSlab is a short list, so this is one
// cheap read shared across however many payslips get resolved.
async function fetchStatutoryConfig(tx: Client): Promise<StatutoryConfig> {
  const [profile, slabs] = await Promise.all([
    tx.companyProfile.findFirst({ select: { pfWageCeiling: true, esiGrossThreshold: true } }),
    tx.ptSlab.findMany({ where: { isActive: true }, orderBy: { minGross: 'asc' } }),
  ]);

  return {
    pfWageCeiling: profile?.pfWageCeiling != null ? Number(profile.pfWageCeiling) : null,
    esiGrossThreshold: profile?.esiGrossThreshold != null ? Number(profile.esiGrossThreshold) : null,
    ptSlabs: slabs.map((s) => ({ minGross: Number(s.minGross), maxGross: s.maxGross != null ? Number(s.maxGross) : null, monthlyAmount: Number(s.monthlyAmount) })),
  };
}

// Generates one Payslip per qualifying employee for the run's period.
// Qualifying = ACTIVE/ON_NOTICE, or EXITED with a dateOfLeaving that falls
// inside this period (their final settlement month) — AND actually part of
// this period's Time & Attendance submission (see the eligibility filter
// below). An employee with no SalaryStructureAssignment covering the
// period's last day is skipped — there's nothing to compute from.
//
// The assignment effective on the LAST day of the period drives the whole
// month's numbers; a structure/CTC change mid-month is not split across two
// assignments in this phase — a documented simplification, not a bug.
export async function generateRunPayslips(tx: Client, runId: number, year: number, month: number): Promise<{ created: number; skipped: number; notEligible: number }> {
  const periodStart = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).toDate();
  const periodEnd = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).endOf('month').toDate();
  const totalDays = daysInMonth(year, month);

  const employees = await tx.employee.findMany({
    where: {
      OR: [
        { status: { in: ['ACTIVE', 'ON_NOTICE'] } },
        { status: 'EXITED', dateOfLeaving: { gte: periodStart, lte: periodEnd } },
      ],
    },
  });
  const statutory = await fetchStatutoryConfig(tx);
  // Applicable / Absent days for every employee in one pass — Total Days
  // (= Regular Days + Overtime, see computeRegularDays) is calculated from these,
  // exactly as the Timesheet screen's own column shows it.
  const dayCounts = await loadAttendanceDayCounts(tx, employees, year, month);

  // HR-entered Overtime days for this period, where any (Regular is no
  // longer entered — it's calculated).
  const timesheetEntries = await tx.timesheetEntry.findMany({ where: { periodYear: year, periodMonth: month } });
  const timesheetEntryByEmployee = new Map(timesheetEntries.map((e) => [e.employeeId, e]));

  // Loan installments sent to Payroll (see loans/[id]/apply-to-run) before
  // this employee had a payslip for this exact period — runId is still
  // null, meaning "intent recorded, not yet attached". Grouped by employee
  // so each new payslip below can fold in whatever's waiting for it.
  const pendingLoanRepayments = await tx.loanRepayment.findMany({
    where: { runId: null, periodYear: year, periodMonth: month },
    include: { loan: true },
  });
  const pendingRepaymentsByEmployee = new Map<number, typeof pendingLoanRepayments>();
  for (const repayment of pendingLoanRepayments) {
    const list = pendingRepaymentsByEmployee.get(repayment.loan.employeeId) ?? [];
    list.push(repayment);
    pendingRepaymentsByEmployee.set(repayment.loan.employeeId, list);
  }

  let created = 0;
  let skipped = 0;
  let notEligible = 0;

  for (const employee of employees) {
    // Auto-computed from APPROVED unpaid-leave requests overlapping this
    // period — Phase 5's Attendance & Leave replacing the "always starts
    // at 0, HR fills it in by hand" behavior from Phase 2. Still just the
    // starting value: recalculatePayslip's manual lopDays override (while
    // the run is DRAFT) still works exactly as before, same interface, in
    // case HR needs to correct it. Computed up front (not just inside the
    // eligibility branch below) since it's also this employee's payroll
    // lopDays either way.
    const autoLopDays = await computeAutoLopDays(tx, employee.id, periodStart, periodEnd);

    // Eligibility gate — both required, matching exactly what the
    // Timesheet screen itself shows as "included this period":
    //   1. Employee.timesheetStatus is ACTIVE — the Timesheet screen's own
    //      per-period Active/Inactive flag (distinct from the employee's
    //      overall HR `status`, already checked above).
    //   2. Their Total Days (= Regular Days (applicable − Absent − LOP) +
    //      Overtime, computeRegularDays/computeTotalDays — the same calculation as the
    //      Timesheet column and its "Send To Payroll" zero-days gate) is > 0.
    // A TimesheetEntry is no longer required: Regular Days is calculated
    // from attendance, so it exists without HR typing anything; the entry
    // only carries Overtime now. Failing either means no payslip at all —
    // not even a zero-net-pay one.
    const timesheetEntry = timesheetEntryByEmployee.get(employee.id);
    if (employee.timesheetStatus !== 'ACTIVE') {
      notEligible += 1;
      continue;
    }
    const counts = dayCounts.get(employee.id)!;
    const calculatedRegular = computeRegularDays({ applicableDays: counts.applicableDays, absentDays: counts.absentDays, lopDays: autoLopDays, weekOffWorkedDays: counts.weekOffWorkedDays, holidayWorkedDays: counts.holidayWorkedDays });
    const regularOverride = timesheetEntry?.regularDaysOverride != null ? Number(timesheetEntry.regularDaysOverride) : null;
    const timesheetTotalDays = computeTotalDays(effectiveRegularDays(calculatedRegular, regularOverride), timesheetEntry ? Number(timesheetEntry.overtimeHours) : 0);
    if (timesheetTotalDays <= 0) {
      notEligible += 1;
      continue;
    }

    const assignment = await tx.salaryStructureAssignment.findFirst({
      where: {
        employeeId: employee.id,
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodEnd } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { structure: { include: { components: { include: { component: true } } } } },
    });

    if (!assignment) {
      skipped += 1;
      continue;
    }

    // Paid days = calendar days (within the joining/leaving window) − LOP
    // − Absent: week offs and paid holidays stay paid — adjusted by however
    // many days HR's Regular Days edit moved from the calculated value (see
    // computePaidDays). Regular / Total Days (working days only) gates
    // eligibility above but is not itself the paid-day count. Without this,
    // an employee submitted with fewer Total Days than the month still got
    // paid for the full calendar-based figure, because Total Days was only
    // ever used as an eligibility gate (>0), never as an input to the
    // actual payable-days ratio.
    const calendarPayableDays = computePayableDays({ year, month, totalDays, lopDays: autoLopDays, dateOfJoining: employee.dateOfJoining, dateOfLeaving: employee.dateOfLeaving });
    const payableDays = computePaidDays({ calendarPayableDays, absentDays: counts.absentDays, calculatedRegular, overrideRegular: regularOverride, monthDays: totalDays });
    const ratio = totalDays > 0 ? payableDays / totalDays : 0;

    const scaledItems = resolveStructureLineItems(assignment.structure.components, statutory).map((item) => ({ ...item, amount: round2(item.amount * ratio) }));
    const grossEarnings = round2(scaledItems.filter((i) => i.type === 'EARNING').reduce((s, i) => s + i.amount, 0));
    const totalDeductions = round2(scaledItems.filter((i) => i.type === 'DEDUCTION').reduce((s, i) => s + i.amount, 0));

    const payslip = await tx.payslip.create({
      data: {
        runId,
        employeeId: employee.id,
        assignmentId: assignment.id,
        totalDays,
        payableDays,
        lopDays: autoLopDays,
        grossEarnings,
        totalDeductions,
        netPay: round2(grossEarnings - totalDeductions),
      },
    });

    await tx.payslipLineItem.createMany({
      data: scaledItems.map((item) => ({ payslipId: payslip.id, componentId: item.componentId, label: item.label, type: item.type, amount: item.amount, isAdjustment: false })),
    });

    const pendingForEmployee = pendingRepaymentsByEmployee.get(employee.id) ?? [];
    if (pendingForEmployee.length > 0) {
      await tx.payslipLineItem.createMany({
        data: pendingForEmployee.map((repayment) => ({
          payslipId: payslip.id,
          componentId: null,
          label: `Loan Recovery — ${repayment.loan.reason || `Loan #${repayment.loan.id}`}`,
          type: 'DEDUCTION',
          amount: repayment.amount,
          isAdjustment: true,
        })),
      });
      await tx.loanRepayment.updateMany({
        where: { id: { in: pendingForEmployee.map((r) => r.id) } },
        data: { runId, payslipId: payslip.id },
      });
      const extraDeduction = round2(pendingForEmployee.reduce((s, r) => s + Number(r.amount), 0));
      await tx.payslip.update({
        where: { id: payslip.id },
        data: { totalDeductions: round2(totalDeductions + extraDeduction), netPay: round2(grossEarnings - totalDeductions - extraDeduction) },
      });
    }

    created += 1;
  }

  return { created, skipped, notEligible };
}

// Recomputes a single payslip's structure-derived line items from scratch
// (never from the previously-scaled stored rows, which would compound
// rounding/ratio errors) using a possibly-new lopDays, and optionally
// replaces the ad-hoc adjustment rows (bonus/arrears/reimbursement/extra
// deduction) wholesale. Only valid while the run is DRAFT.
export async function recalculatePayslip(
  tx: Client,
  payslipId: number,
  updates: { lopDays?: number; adjustments?: Array<{ label: string; type: string; amount: number }> }
) {
  const payslip = await tx.payslip.findUnique({ where: { id: payslipId }, include: { run: true, employee: true } });
  if (!payslip) throw new Error('Payslip not found');
  if (payslip.run.status !== 'DRAFT') throw new RunNotEditableError('This payroll run is no longer in DRAFT — reopen it before editing a payslip');
  if (!payslip.assignmentId) throw new Error('Payslip has no linked salary assignment to recompute from');

  const assignment = await tx.salaryStructureAssignment.findUniqueOrThrow({
    where: { id: payslip.assignmentId },
    include: { structure: { include: { components: { include: { component: true } } } } },
  });

  const lopDays = updates.lopDays ?? Number(payslip.lopDays);
  const calendarPayableDays = computePayableDays({
    year: payslip.run.payPeriodYear,
    month: payslip.run.payPeriodMonth,
    totalDays: payslip.totalDays,
    lopDays,
    dateOfJoining: payslip.employee.dateOfJoining,
    dateOfLeaving: payslip.employee.dateOfLeaving,
  });

  // Same paid-days rule generateRunPayslips applies — calendar days − LOP
  // (the possibly-edited lopDays, via computePayableDays above) − Absent,
  // adjusted by HR's Regular Days edit if any.
  const counts = (await loadAttendanceDayCounts(tx, [payslip.employee], payslip.run.payPeriodYear, payslip.run.payPeriodMonth)).get(payslip.employeeId)!;
  const timesheetEntry = await tx.timesheetEntry.findFirst({
    where: { employeeId: payslip.employeeId, periodYear: payslip.run.payPeriodYear, periodMonth: payslip.run.payPeriodMonth },
  });
  const calculatedRegular = computeRegularDays({ applicableDays: counts.applicableDays, absentDays: counts.absentDays, lopDays, weekOffWorkedDays: counts.weekOffWorkedDays, holidayWorkedDays: counts.holidayWorkedDays });
  const payableDays = computePaidDays({
    calendarPayableDays,
    absentDays: counts.absentDays,
    calculatedRegular,
    overrideRegular: timesheetEntry?.regularDaysOverride != null ? Number(timesheetEntry.regularDaysOverride) : null,
    monthDays: payslip.totalDays,
  });
  const ratio = payslip.totalDays > 0 ? payableDays / payslip.totalDays : 0;

  const statutory = await fetchStatutoryConfig(tx);
  const scaledItems = resolveStructureLineItems(assignment.structure.components, statutory).map((item) => ({ ...item, amount: round2(item.amount * ratio) }));

  await tx.payslipLineItem.deleteMany({ where: { payslipId, isAdjustment: false } });
  await tx.payslipLineItem.createMany({
    data: scaledItems.map((item) => ({ payslipId, componentId: item.componentId, label: item.label, type: item.type, amount: item.amount, isAdjustment: false })),
  });

  if (updates.adjustments) {
    await tx.payslipLineItem.deleteMany({ where: { payslipId, isAdjustment: true } });
    if (updates.adjustments.length > 0) {
      await tx.payslipLineItem.createMany({
        data: updates.adjustments.map((a) => ({ payslipId, componentId: null, label: a.label, type: a.type, amount: round2(a.amount), isAdjustment: true })),
      });
    }
  }

  const allItems = await tx.payslipLineItem.findMany({ where: { payslipId } });
  const grossEarnings = round2(allItems.filter((i) => i.type === 'EARNING').reduce((s, i) => s + Number(i.amount), 0));
  const totalDeductions = round2(allItems.filter((i) => i.type === 'DEDUCTION').reduce((s, i) => s + Number(i.amount), 0));

  const updateResult = await tx.payslip.updateMany({
    where: { id: payslipId, version: payslip.version },
    data: { lopDays, payableDays, grossEarnings, totalDeductions, netPay: round2(grossEarnings - totalDeductions), version: { increment: 1 } },
  });
  if (updateResult.count === 0) throw new OptimisticLockError('Payslip was modified by someone else — reload and try again');

  return tx.payslip.findUniqueOrThrow({ where: { id: payslipId }, include: { lineItems: true } });
}

// Status transition on the run itself — full matrix, optimistic lock via
// updateMany({where: {id, version}}), same idiom as AdminTicket's
// changeTicketStatus.
export async function changeRunStatus(tx: Client, runId: number, toStatus: RunStatus, version: number, performedById: number | null) {
  const existing = await tx.payrollRun.findUnique({ where: { id: runId } });
  if (!existing) throw new Error('Payroll run not found');

  const fromStatus = existing.status as RunStatus;
  if (!isValidRunStatusTransition(fromStatus, toStatus)) {
    throw new InvalidStatusTransitionError(`Cannot move a payroll run from ${fromStatus} to ${toStatus}`);
  }

  const data: Record<string, unknown> = { status: toStatus, version: { increment: 1 } };
  if (toStatus === 'APPROVED') {
    data.approvedById = performedById;
    data.approvedAt = new Date();
  } else if (toStatus === 'PROCESSED') {
    data.processedAt = new Date();
  } else if (toStatus === 'PAID') {
    data.paidAt = new Date();
  } else if (toStatus === 'DRAFT') {
    // Reopened — clear the downstream timestamps so a re-approval reads as
    // fresh rather than keeping a stale approvedAt from before the reopen.
    data.approvedById = null;
    data.approvedAt = null;
    data.processedAt = null;
    data.paidAt = null;
  }

  const updateResult = await tx.payrollRun.updateMany({ where: { id: runId, version }, data });
  if (updateResult.count === 0) {
    throw new OptimisticLockError('Payroll run was modified by someone else — reload and try again');
  }

  await applyOrReverseLoanRepayments(tx, runId, fromStatus, toStatus);
  await syncPayrollRunExpense(tx, runId, toStatus, performedById);

  return tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
}

// Payroll Run -> Expense integration. Once a run is approved (or moved
// further to PROCESSED/PAID) it gets exactly ONE SALARY expense in the
// Expense module — Category "Salary & Wages", Sub Category "Salary", amount
// = the run's total net pay (sum of its payslips, as already calculated) —
// whose status mirrors the run: APPROVED -> PENDING, PROCESSED -> PROCESSED,
// PAID -> PAID. The employee-wise breakdown is not copied; the Expenses list
// reads it from the run's payslips. Nothing is created for a DRAFT or
// CANCELLED run, and reopening/cancelling soft-deletes the expense. Keyed on
// the unique Expense.payrollRunId, so re-approving/re-processing the same
// run updates (or restores) that one expense — never a duplicate — and it
// keeps its original expense number.
const EXPENSE_STATUS_FOR_RUN: Partial<Record<RunStatus, string>> = { APPROVED: 'PENDING', PROCESSED: 'PROCESSED', PAID: 'PAID' };
export const SALARY_EXPENSE_CATEGORY = 'Salary & Wages';
export const SALARY_EXPENSE_SUB_CATEGORY = 'Salary';

async function syncPayrollRunExpense(tx: Client, runId: number, toStatus: RunStatus, performedById: number | null): Promise<void> {
  const existing = await tx.expense.findUnique({ where: { payrollRunId: runId }, select: { id: true, deletedAt: true } });
  const softDelete = async () => {
    if (existing && !existing.deletedAt) await tx.expense.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  };

  const expenseStatus = EXPENSE_STATUS_FOR_RUN[toStatus];
  if (!expenseStatus) return softDelete();

  const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { payslips: { select: { netPay: true } } } });
  const totalNetPay = round2(run.payslips.reduce((sum, p) => sum + Number(p.netPay), 0));
  if (totalNetPay <= 0) return softDelete();

  const category = await tx.expenseCategory.findUnique({
    where: { name: SALARY_EXPENSE_CATEGORY },
    include: { subCategories: { where: { name: SALARY_EXPENSE_SUB_CATEGORY } } },
  });
  if (!category) throw new Error(`Expense category "${SALARY_EXPENSE_CATEGORY}" not found — create it before approving payroll`);

  const period = dayjs(new Date(Date.UTC(run.payPeriodYear, run.payPeriodMonth - 1, 1)));
  const data = {
    categoryId: category.id,
    subCategoryId: category.subCategories[0]?.id ?? null,
    // Booked on the last day of the pay period it belongs to.
    expenseDate: new Date(Date.UTC(run.payPeriodYear, run.payPeriodMonth, 0)),
    amount: totalNetPay,
    currencyCode: 'INR',
    exchangeRate: 1,
    paymentMethod: 'BANK_TRANSFER',
    status: expenseStatus,
    paidDate: expenseStatus === 'PAID' ? run.paidAt ?? new Date() : null,
    referenceNumber: `PAYROLL-${period.format('YYYY-MM')}`,
    notes: `Payroll – ${period.format('MMMM YYYY')} (${run.payslips.length} employee${run.payslips.length === 1 ? '' : 's'})`,
    source: 'SALARY',
    deletedAt: null,
  };

  if (existing) {
    await tx.expense.update({ where: { id: existing.id }, data });
  } else {
    await tx.expense.create({ data: { ...data, payrollRunId: runId, expenseNumber: await nextExpenseNumber(tx), recordedById: performedById } });
  }
}

const COMMITTED_STATUSES: RunStatus[] = ['PROCESSED', 'PAID'];

// A loan's outstandingBalance only actually moves once its run is
// "committed" (PROCESSED or PAID) — not the moment an installment is
// tentatively added to a still-DRAFT payslip (see loans/[id]/apply-to-run,
// which only logs a PENDING LoanRepayment). Crossing the DRAFT/APPROVED
// <-> PROCESSED/PAID boundary in either direction applies or reverses
// every repayment logged against this run, symmetrically — reopening a
// PROCESSED run back to DRAFT undoes the balance change exactly as
// cleanly as committing it applied it, matching PayrollRun's own
// reversible-status philosophy.
async function applyOrReverseLoanRepayments(tx: Client, runId: number, fromStatus: RunStatus, toStatus: RunStatus): Promise<void> {
  const wasCommitted = COMMITTED_STATUSES.includes(fromStatus);
  const willBeCommitted = COMMITTED_STATUSES.includes(toStatus);
  if (wasCommitted === willBeCommitted) return; // no boundary crossed

  if (!wasCommitted && willBeCommitted) {
    const pending = await tx.loanRepayment.findMany({ where: { runId, status: 'PENDING' }, include: { loan: true } });
    for (const repayment of pending) {
      const newBalance = round2(Number(repayment.loan.outstandingBalance) - Number(repayment.amount));
      await tx.loan.update({
        where: { id: repayment.loanId },
        data: { outstandingBalance: Math.max(0, newBalance), status: newBalance <= 0 ? 'CLOSED' : repayment.loan.status },
      });
      await tx.loanRepayment.update({ where: { id: repayment.id }, data: { status: 'APPLIED' } });
    }
  } else {
    const applied = await tx.loanRepayment.findMany({ where: { runId, status: 'APPLIED' }, include: { loan: true } });
    for (const repayment of applied) {
      const restoredBalance = round2(Number(repayment.loan.outstandingBalance) + Number(repayment.amount));
      await tx.loan.update({
        where: { id: repayment.loanId },
        data: { outstandingBalance: restoredBalance, status: repayment.loan.status === 'CLOSED' ? 'ACTIVE' : repayment.loan.status },
      });
      await tx.loanRepayment.update({ where: { id: repayment.id }, data: { status: 'PENDING' } });
    }
  }
}
