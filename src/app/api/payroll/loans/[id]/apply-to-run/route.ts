import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { recalculatePayslip, RunNotEditableError } from '@/lib/payroll/runService';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Sends a loan installment to Payroll for a given period — independent of
// whether that period's PayrollRun exists yet. Two outcomes:
//  - A payslip for this employee already exists for that period, on a
//    still-DRAFT run: attach immediately (reuses recalculatePayslip's
//    existing adjustments mechanism, so it inherits the same optimistic-
//    lock treatment as any other payslip edit).
//  - No such payslip yet (no run generated for that period, the employee
//    wasn't part of that period's Time & Attendance, or the run holding
//    their payslip isn't DRAFT): record the installment as a PENDING,
//    period-scoped LoanRepayment with no run/payslip attached.
//    generateRunPayslips (including via Regenerate) picks these up and
//    attaches them automatically the moment a matching payslip is created
//    — see its own comment in runService.ts.
// Either way, the loan's outstandingBalance itself only moves once the run
// is actually committed (see changeRunStatus/applyOrReverseLoanRepayments).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('run_payroll');
  if (denied) return denied;

  try {
    const loanId = parseInt(params.id);
    const body = await request.json();
    const payPeriodYear = Number(body.payPeriodYear);
    const payPeriodMonth = Number(body.payPeriodMonth);
    const amount = Number(body.amount);
    if (!payPeriodYear || !payPeriodMonth || payPeriodMonth < 1 || payPeriodMonth > 12 || !amount || amount <= 0) {
      return NextResponse.json({ message: 'payPeriodYear, payPeriodMonth, and a positive amount are required' }, { status: 400 });
    }

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return NextResponse.json({ message: 'Loan not found' }, { status: 404 });
    if (loan.status !== 'ACTIVE') return NextResponse.json({ message: 'Only an active loan can have an installment applied' }, { status: 400 });
    if (amount > Number(loan.outstandingBalance)) {
      return NextResponse.json({ message: `Amount exceeds the outstanding balance (₹${loan.outstandingBalance})` }, { status: 400 });
    }

    const periodLabel = `${MONTH_NAMES[payPeriodMonth - 1]} ${payPeriodYear}`;
    const existingRepayment = await prisma.loanRepayment.findUnique({
      where: { loanId_periodYear_periodMonth: { loanId, periodYear: payPeriodYear, periodMonth: payPeriodMonth } },
    });
    if (existingRepayment) {
      return NextResponse.json({ message: `Loan installment for ${periodLabel} has already been sent to Payroll.` }, { status: 409 });
    }

    const label = `Loan Recovery — ${loan.reason || `Loan #${loan.id}`}`;
    const run = await prisma.payrollRun.findUnique({ where: { payPeriodYear_payPeriodMonth: { payPeriodYear, payPeriodMonth } } });
    const payslip = run
      ? await prisma.payslip.findUnique({ where: { runId_employeeId: { runId: run.id, employeeId: loan.employeeId } }, include: { lineItems: true } })
      : null;

    if (payslip) {
      try {
        const existingAdjustments = payslip.lineItems
          .filter((li) => li.isAdjustment)
          .map((li) => ({ label: li.label, type: li.type, amount: Number(li.amount) }));

        const result = await prisma.$transaction(async (tx) => {
          const updatedPayslip = await recalculatePayslip(tx, payslip.id, {
            adjustments: [...existingAdjustments, { label, type: 'DEDUCTION', amount }],
          });
          const repayment = await tx.loanRepayment.create({
            data: { loanId, runId: run!.id, payslipId: payslip.id, periodYear: payPeriodYear, periodMonth: payPeriodMonth, amount },
          });
          return { payslip: updatedPayslip, repayment };
        });

        await logAudit({ action: 'CREATE', entityType: 'LOAN_REPAYMENT', entityId: result.repayment.id, newValue: result.repayment, description: `₹${amount} loan installment applied to run ${run!.id} for loan ${loanId}`, request });
        return NextResponse.json({ ...result, attached: true }, { status: 201 });
      } catch (error) {
        if (!(error instanceof RunNotEditableError)) throw error;
        // Run exists but isn't DRAFT anymore — fall through to recording a
        // pending, unattached intent instead of hard-failing.
      }
    }

    const repayment = await prisma.loanRepayment.create({
      data: { loanId, runId: null, payslipId: null, periodYear: payPeriodYear, periodMonth: payPeriodMonth, amount },
    });
    await logAudit({ action: 'CREATE', entityType: 'LOAN_REPAYMENT', entityId: repayment.id, newValue: repayment, description: `₹${amount} loan installment recorded for ${periodLabel} — will apply once that period's payroll is generated`, request });
    return NextResponse.json({ repayment, attached: false }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/loans/[id]/apply-to-run error:', error);
    return NextResponse.json({ message: error.message || 'Failed to apply loan installment' }, { status: 400 });
  }
}
