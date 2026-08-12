import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { recalculatePayslip, OptimisticLockError, RunNotEditableError } from '@/lib/payroll/runService';
import { ADJUSTMENT_TYPES } from '@/lib/payroll/constants';

export const dynamic = 'force-dynamic';

// LOP days and one-off adjustments (bonus/arrears/reimbursement/extra
// deduction) — only while the payslip's run is DRAFT. Both fully replace
// their respective set rather than patching individual rows, same
// "replace, don't patch" contract as the salary-structure components PATCH.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('run_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();

    if (body.adjustments) {
      for (const a of body.adjustments) {
        if (!a.label || !ADJUSTMENT_TYPES.includes(a.type) || a.amount == null) {
          return NextResponse.json({ message: 'Each adjustment needs a label, type (EARNING|DEDUCTION), and amount' }, { status: 400 });
        }
      }
    }

    const payslip = await prisma.$transaction((tx) =>
      recalculatePayslip(tx, id, {
        lopDays: body.lopDays != null ? Number(body.lopDays) : undefined,
        adjustments: body.adjustments,
      })
    );

    await logAudit({ action: 'UPDATE', entityType: 'PAYSLIP', entityId: payslip.id, newValue: { netPay: payslip.netPay, lopDays: payslip.lopDays }, description: `Payslip ${payslip.id} recalculated`, request });

    return NextResponse.json(payslip);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof RunNotEditableError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/payroll/payslips/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update payslip' }, { status: 400 });
  }
}
