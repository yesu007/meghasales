import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const year = parseInt(searchParams.get('year') || '', 10);
    const month = parseInt(searchParams.get('month') || '', 10);

    const loans = await prisma.loan.findMany({
      where: status ? { status } : {},
      include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Month-wise Collection Status, only computed when a period is given
    // (the Loans & Advances table's own month picker) — period-scoped, not
    // run-scoped, since a loan installment can be sent before that month's
    // PayrollRun even exists (see loans/[id]/apply-to-run). Pending covers
    // "never sent", "sent but not yet attached to a run" and "attached but
    // still PENDING" (that run hasn't been PROCESSED/PAID yet); only an
    // APPLIED repayment reads as Collected. Mirrors
    // applyOrReverseLoanRepayments in runService.ts, which is the only
    // place a repayment ever actually flips to APPLIED.
    if (Number.isFinite(year) && Number.isFinite(month)) {
      const repayments = await prisma.loanRepayment.findMany({ where: { periodYear: year, periodMonth: month, loanId: { in: loans.map((l) => l.id) } } });
      const repaymentByLoan = new Map(repayments.map((r) => [r.loanId, r]));

      const withStatus = loans.map((loan) => {
        const repayment = repaymentByLoan.get(loan.id);
        return {
          ...loan,
          collectionStatus: repayment?.status === 'APPLIED' ? 'COLLECTED' : 'PENDING',
          alreadySentThisPeriod: !!repayment,
        };
      });
      return NextResponse.json(withStatus);
    }

    return NextResponse.json(loans);
  } catch (error) {
    console.error('GET /api/payroll/loans error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const body = await request.json();
    const { employeeId, principal, monthlyInstallment, disbursedDate, reason } = body;
    if (!employeeId || !principal || !monthlyInstallment || !disbursedDate) {
      return NextResponse.json({ message: 'employeeId, principal, monthlyInstallment, and disbursedDate are required' }, { status: 400 });
    }
    if (Number(monthlyInstallment) <= 0 || Number(principal) <= 0) {
      return NextResponse.json({ message: 'principal and monthlyInstallment must be positive' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({ where: { id: Number(employeeId) } });
    if (!employee) return NextResponse.json({ message: 'Employee not found' }, { status: 404 });

    const session = await getServerSession(authOptions);
    const loan = await prisma.loan.create({
      data: {
        employeeId: Number(employeeId),
        principal: Number(principal),
        outstandingBalance: Number(principal),
        monthlyInstallment: Number(monthlyInstallment),
        disbursedDate: new Date(disbursedDate),
        reason: reason || null,
        createdById: currentUserId(session),
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'LOAN', entityId: loan.id, newValue: loan, description: `Loan of ₹${loan.principal} disbursed to employee ${employee.employeeCode}`, request });

    return NextResponse.json(loan, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/loans error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create loan' }, { status: 400 });
  }
}
