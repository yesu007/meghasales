import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { changeRunStatus, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/payroll/runService';
import { RUN_STATUSES, RunStatus } from '@/lib/payroll/constants';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: {
            employee: { select: { employeeCode: true, department: true, designation: true, firstName: true, lastName: true } },
            lineItems: { orderBy: { id: 'asc' } },
          },
          orderBy: { id: 'asc' },
        },
      },
    });
    if (!run) return NextResponse.json({ message: 'Payroll run not found' }, { status: 404 });
    return NextResponse.json(run);
  } catch (error) {
    console.error('GET /api/payroll/runs/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('approve_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (!body.status || !(RUN_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ message: `status must be one of ${RUN_STATUSES.join(', ')}` }, { status: 400 });
    }
    if (body.version == null) {
      return NextResponse.json({ message: 'version is required for optimistic-lock updates' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);

    const run = await prisma.$transaction((tx) => changeRunStatus(tx, id, body.status as RunStatus, Number(body.version), performedById));

    await logAudit({ action: 'UPDATE', entityType: 'PAYROLL_RUN', entityId: run.id, newValue: { status: run.status }, description: `Payroll run ${run.payPeriodMonth}/${run.payPeriodYear} moved to ${run.status}`, request });

    return NextResponse.json(run);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/payroll/runs/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update payroll run' }, { status: 400 });
  }
}
