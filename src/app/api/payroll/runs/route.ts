import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { generateRunPayslips } from '@/lib/payroll/runService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET() {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const runs = await prisma.payrollRun.findMany({
      include: { payslips: { select: { netPay: true } } },
      orderBy: [{ payPeriodYear: 'desc' }, { payPeriodMonth: 'desc' }],
    });

    const content = runs.map((r) => {
      const { payslips, ...rest } = r;
      return {
        ...rest,
        employeeCount: payslips.length,
        totalNetPay: payslips.reduce((s, p) => s + Number(p.netPay), 0),
      };
    });

    return NextResponse.json(content);
  } catch (error) {
    console.error('GET /api/payroll/runs error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('run_payroll');
  if (denied) return denied;

  try {
    const body = await request.json();
    const year = Number(body.payPeriodYear);
    const month = Number(body.payPeriodMonth);
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ message: 'payPeriodYear and payPeriodMonth (1-12) are required' }, { status: 400 });
    }

    const existing = await prisma.payrollRun.findUnique({ where: { payPeriodYear_payPeriodMonth: { payPeriodYear: year, payPeriodMonth: month } } });
    if (existing) return NextResponse.json({ message: `A payroll run for ${month}/${year} already exists` }, { status: 409 });

    const session = await getServerSession(authOptions);
    const initiatedById = currentUserId(session);

    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({ data: { payPeriodYear: year, payPeriodMonth: month, initiatedById } });
      const { created, skipped } = await generateRunPayslips(tx, run.id, year, month);
      return { run, created, skipped };
    });

    await logAudit({
      action: 'CREATE',
      entityType: 'PAYROLL_RUN',
      entityId: result.run.id,
      newValue: result.run,
      description: `Payroll run for ${month}/${year} generated — ${result.created} payslip(s), ${result.skipped} employee(s) skipped (no active salary assignment)`,
      request,
    });

    return NextResponse.json({ ...result.run, created: result.created, skipped: result.skipped }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/payroll/runs error:', error);
    return NextResponse.json({ message: error.message || 'Failed to generate payroll run' }, { status: 400 });
  }
}
