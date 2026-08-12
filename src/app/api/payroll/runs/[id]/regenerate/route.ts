import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { generateRunPayslips } from '@/lib/payroll/runService';

export const dynamic = 'force-dynamic';

// Wipes and rebuilds every payslip for a still-DRAFT run — for when an
// employee was onboarded late, a salary structure got corrected, or an LOP
// entry needs to start over. Any manual adjustments already entered on
// individual payslips are lost, same as re-running any other draft
// generation step; that's why this is a separate explicit action rather
// than something the run-detail page does automatically on every load.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('run_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const run = await prisma.payrollRun.findUnique({ where: { id } });
    if (!run) return NextResponse.json({ message: 'Payroll run not found' }, { status: 404 });
    if (run.status !== 'DRAFT') {
      return NextResponse.json({ message: 'Only a DRAFT run can be regenerated — reopen it to DRAFT first' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // A regenerate only ever runs on a DRAFT run, so any LoanRepayment
      // row for it is still PENDING (nothing gets to APPLIED before
      // PROCESSED) — safe to drop along with the payslips they were
      // logged against.
      await tx.loanRepayment.deleteMany({ where: { runId: id, status: 'PENDING' } });
      await tx.payslip.deleteMany({ where: { runId: id } });
      return generateRunPayslips(tx, id, run.payPeriodYear, run.payPeriodMonth);
    });

    await logAudit({ action: 'UPDATE', entityType: 'PAYROLL_RUN', entityId: id, description: `Payroll run ${run.payPeriodMonth}/${run.payPeriodYear} regenerated — ${result.created} payslip(s), ${result.skipped} skipped`, request });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('POST /api/payroll/runs/[id]/regenerate error:', error);
    return NextResponse.json({ message: error.message || 'Failed to regenerate payroll run' }, { status: 400 });
  }
}
