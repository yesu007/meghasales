import { Prisma, PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import { isValidRunStatusTransition, RunStatus } from './constants';
import { computePayableDays, daysInMonth, resolveStructureLineItems, round2, StatutoryConfig } from './runEngine';
import { computeAutoLopDays } from './leaveEngine';
import { computeOtherLeaveDays, computeTotalDaysFromHours, computePaidHolidayHours, HOURS_PER_DAY } from './timesheetEngine';

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
  // Same company holiday calendar the Timesheet screen's own Total Days
  // column folds in (see GET /api/payroll/timesheet) — fetched once here,
  // not per employee, same convention as fetchStatutoryConfig above.
  const holidays = await tx.paidHoliday.findMany({ where: { isActive: true, date: { gte: periodStart, lte: periodEnd } } });

  // Payroll must only ever include employees who were actually part of
  // THIS period's Time & Attendance submission — not every globally-
  // active employee who happens to have a salary structure/Basic Salary.
  // A TimesheetEntry row only exists once HR has entered Regular/Overtime
  // days for that employee for this exact (year, month) — that's the
  // signal "Total Days are provided", read directly rather than re-derived.
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

    // Eligibility gate — three conditions, all required, matching exactly
    // what the Timesheet screen itself shows as "included this period":
    //   1. A TimesheetEntry exists for them this (year, month) — they were
    //      actually part of the Time & Attendance submission, not just
    //      present in the employee master.
    //   2. Employee.timesheetStatus is ACTIVE — the Timesheet screen's own
    //      per-period Active/Inactive flag (distinct from the employee's
    //      overall HR `status`, already checked above).
    //   3. Their Total Days — computed with the exact same formula the
    //      Timesheet screen's own column and its "Send To Payroll" zero-
    //      days gate use (computeTotalDaysFromHours) — is > 0.
    // Failing any of these means Time & Attendance never actually sent
    // this employee over for this period, so they get no payslip at all —
    // not even a zero-net-pay one — regardless of Basic Salary or an
    // active SalaryStructureAssignment.
    const timesheetEntry = timesheetEntryByEmployee.get(employee.id);
    if (!timesheetEntry || employee.timesheetStatus !== 'ACTIVE') {
      notEligible += 1;
      continue;
    }
    const otherLeaveDays = await computeOtherLeaveDays(tx, employee.id, periodStart, periodEnd);
    const paidHolidayDays = round2(computePaidHolidayHours(holidays, periodStart, periodEnd, employee) / HOURS_PER_DAY);
    const timesheetTotalDays = computeTotalDaysFromHours(Number(timesheetEntry.regularHours), Number(timesheetEntry.overtimeHours), otherLeaveDays, autoLopDays, paidHolidayDays);
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

    // payableDays is capped to whichever is stricter: the calendar-based
    // figure (join/leave date + LOP) or the employee's actual Timesheet
    // Total Days (regular+overtime+other-leave-days, already entered by HR
    // for this exact period — see timesheetTotalDays above). Without this,
    // an employee submitted with fewer Total Days than the month still got
    // paid for the full calendar-based figure, because Total Days was only
    // ever used as an eligibility gate (>0), never as an input to the
    // actual payable-days ratio.
    const calendarPayableDays = computePayableDays({ year, month, totalDays, lopDays: autoLopDays, dateOfJoining: employee.dateOfJoining, dateOfLeaving: employee.dateOfLeaving });
    const payableDays = Math.min(calendarPayableDays, timesheetTotalDays);
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

  // Same Timesheet Total Days cap generateRunPayslips applies — re-derived
  // here (rather than trusting the payslip's original totalDays/payableDays)
  // because a manual lopDays edit changes Total Days too (it's one of
  // computeTotalDaysFromHours's own inputs), so this has to be recomputed
  // against the current Timesheet entry, not just the calendar figure.
  const periodStart = dayjs(`${payslip.run.payPeriodYear}-${String(payslip.run.payPeriodMonth).padStart(2, '0')}-01`).toDate();
  const periodEnd = dayjs(periodStart).endOf('month').toDate();
  const timesheetEntry = await tx.timesheetEntry.findFirst({
    where: { employeeId: payslip.employeeId, periodYear: payslip.run.payPeriodYear, periodMonth: payslip.run.payPeriodMonth },
  });
  const holidays = await tx.paidHoliday.findMany({ where: { isActive: true, date: { gte: periodStart, lte: periodEnd } } });
  const paidHolidayDays = round2(computePaidHolidayHours(holidays, periodStart, periodEnd, payslip.employee) / HOURS_PER_DAY);
  const payableDays = timesheetEntry
    ? Math.min(calendarPayableDays, computeTotalDaysFromHours(
        Number(timesheetEntry.regularHours),
        Number(timesheetEntry.overtimeHours),
        await computeOtherLeaveDays(tx, payslip.employeeId, periodStart, periodEnd),
        lopDays,
        paidHolidayDays
      ))
    : calendarPayableDays;
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

  return tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
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
