import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { recalculatePayslip, RunNotEditableError } from '@/lib/payroll/runService';

export const dynamic = 'force-dynamic';

// Adds a loan installment as a deduction adjustment on the employee's
// payslip within a DRAFT run — reusing recalculatePayslip's existing
// adjustments mechanism rather than a parallel one, so it inherits the
// same DRAFT-only guard and gets the same optimistic-lock treatment.
// Logs a PENDING LoanRepayment; the loan's outstandingBalance itself only
// moves once the run is actually committed (see changeRunStatus).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('run_payroll');
  if (denied) return denied;

  try {
    const loanId = parseInt(params.id);
    const body = await request.json();
    const runId = Number(body.runId);
    const amount = Number(body.amount);
    if (!runId || !amount || amount <= 0) {
      return NextResponse.json({ message: 'runId and a positive amount are required' }, { status: 400 });
    }

    const loan = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) return NextResponse.json({ message: 'Loan not found' }, { status: 404 });
    if (loan.status !== 'ACTIVE') return NextResponse.json({ message: 'Only an active loan can have an installment applied' }, { status: 400 });
    if (amount > Number(loan.outstandingBalance)) {
      return NextResponse.json({ message: `Amount exceeds the outstanding balance (₹${loan.outstandingBalance})` }, { status: 400 });
    }

    const existingRepayment = await prisma.loanRepayment.findUnique({ where: { loanId_runId: { loanId, runId } } });
    if (existingRepayment) return NextResponse.json({ message: 'This loan already has an installment applied to this run' }, { status: 409 });

    const payslip = await prisma.payslip.findUnique({ where: { runId_employeeId: { runId, employeeId: loan.employeeId } }, include: { lineItems: true } });
    if (!payslip) return NextResponse.json({ message: 'This employee has no payslip in that run' }, { status: 404 });

    const label = `Loan Recovery — ${loan.reason || `Loan #${loan.id}`}`;
    const existingAdjustments = payslip.lineItems
      .filter((li) => li.isAdjustment)
      .map((li) => ({ label: li.label, type: li.type, amount: Number(li.amount) }));

    const result = await prisma.$transaction(async (tx) => {
      const updatedPayslip = await recalculatePayslip(tx, payslip.id, {
        adjustments: [...existingAdjustments, { label, type: 'DEDUCTION', amount }],
      });
      const repayment = await tx.loanRepayment.create({ data: { loanId, runId, payslipId: payslip.id, amount } });
      return { payslip: updatedPayslip, repayment };
    });

    await logAudit({ action: 'CREATE', entityType: 'LOAN_REPAYMENT', entityId: result.repayment.id, newValue: result.repayment, description: `₹${amount} loan installment applied to run ${runId} for loan ${loanId}`, request });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error instanceof RunNotEditableError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/payroll/loans/[id]/apply-to-run error:', error);
    return NextResponse.json({ message: error.message || 'Failed to apply loan installment' }, { status: 400 });
  }
}
