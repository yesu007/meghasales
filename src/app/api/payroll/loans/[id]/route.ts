import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
        repayments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!loan) return NextResponse.json({ message: 'Loan not found' }, { status: 404 });
    return NextResponse.json(loan);
  } catch (error) {
    console.error('GET /api/payroll/loans/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// monthlyInstallment can change going forward; status can be set to
// CANCELLED (a loan disbursed in error, or written off) — outstandingBalance
// itself is never edited directly here, only ever through apply-to-run's
// repayment log, so there's one path that ever moves it.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.loan.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Loan not found' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.monthlyInstallment !== undefined) data.monthlyInstallment = Number(body.monthlyInstallment);
    if (body.reason !== undefined) data.reason = body.reason;
    if (body.status !== undefined) {
      if (!['ACTIVE', 'CLOSED', 'CANCELLED'].includes(body.status)) {
        return NextResponse.json({ message: 'status must be ACTIVE, CLOSED, or CANCELLED' }, { status: 400 });
      }
      data.status = body.status;
    }

    const loan = await prisma.loan.update({ where: { id }, data });
    await logAudit({ action: 'UPDATE', entityType: 'LOAN', entityId: loan.id, oldValue: existing, newValue: loan, description: `Loan ${loan.id} updated`, request });

    return NextResponse.json(loan);
  } catch (error: any) {
    console.error('PATCH /api/payroll/loans/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update loan' }, { status: 400 });
  }
}
