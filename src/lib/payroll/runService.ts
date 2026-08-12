import { Prisma, PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import { isValidRunStatusTransition, RunStatus } from './constants';
import { computePayableDays, daysInMonth, resolveStructureLineItems, round2 } from './runEngine';

export class OptimisticLockError extends Error {}
export class InvalidStatusTransitionError extends Error {}
export class RunNotEditableError extends Error {}

type Client = Prisma.TransactionClient | PrismaClient;

// Generates one Payslip per qualifying employee for the run's period.
// Qualifying = ACTIVE/ON_NOTICE, or EXITED with a dateOfLeaving that falls
// inside this period (their final settlement month). An employee with no
// SalaryStructureAssignment covering the period's last day is skipped —
// there's nothing to compute from.
//
// The assignment effective on the LAST day of the period drives the whole
// month's numbers; a structure/CTC change mid-month is not split across two
// assignments in this phase — a documented simplification, not a bug.
export async function generateRunPayslips(tx: Client, runId: number, year: number, month: number): Promise<{ created: number; skipped: number }> {
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

  let created = 0;
  let skipped = 0;

  for (const employee of employees) {
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

    const payableDays = computePayableDays({ year, month, totalDays, lopDays: 0, dateOfJoining: employee.dateOfJoining, dateOfLeaving: employee.dateOfLeaving });
    const ratio = totalDays > 0 ? payableDays / totalDays : 0;

    const scaledItems = resolveStructureLineItems(assignment.structure.components).map((item) => ({ ...item, amount: round2(item.amount * ratio) }));
    const grossEarnings = round2(scaledItems.filter((i) => i.type === 'EARNING').reduce((s, i) => s + i.amount, 0));
    const totalDeductions = round2(scaledItems.filter((i) => i.type === 'DEDUCTION').reduce((s, i) => s + i.amount, 0));

    const payslip = await tx.payslip.create({
      data: {
        runId,
        employeeId: employee.id,
        assignmentId: assignment.id,
        totalDays,
        payableDays,
        lopDays: 0,
        grossEarnings,
        totalDeductions,
        netPay: round2(grossEarnings - totalDeductions),
      },
    });

    await tx.payslipLineItem.createMany({
      data: scaledItems.map((item) => ({ payslipId: payslip.id, componentId: item.componentId, label: item.label, type: item.type, amount: item.amount, isAdjustment: false })),
    });

    created += 1;
  }

  return { created, skipped };
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
  const payableDays = computePayableDays({
    year: payslip.run.payPeriodYear,
    month: payslip.run.payPeriodMonth,
    totalDays: payslip.totalDays,
    lopDays,
    dateOfJoining: payslip.employee.dateOfJoining,
    dateOfLeaving: payslip.employee.dateOfLeaving,
  });
  const ratio = payslip.totalDays > 0 ? payableDays / payslip.totalDays : 0;

  const scaledItems = resolveStructureLineItems(assignment.structure.components).map((item) => ({ ...item, amount: round2(item.amount * ratio) }));

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

  return tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
}
