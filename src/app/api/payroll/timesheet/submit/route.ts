import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// "Send To Payroll" / "Reopen" — a two-state toggle on TimesheetPeriod, the
// same one-step-reversible convention PayrollRun uses for its own status
// rather than a one-way pipeline. run_payroll (not manage_employees) since
// this is the "hand this period off to payroll processing" action, the same
// permission tier that generates a PayrollRun itself.
export async function POST(request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('run_payroll');
  if (denied) return denied;

  try {
    const body = await request.json();
    const year = parseInt(body.year, 10);
    const month = parseInt(body.month, 10);
    const toStatus = body.status === 'OPEN' ? 'OPEN' : 'SUBMITTED';
    if (!year || !month) return NextResponse.json({ message: 'year and month are required' }, { status: 400 });

    const session = await getServerSession(authOptions);
    const performedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const period = await prisma.timesheetPeriod.upsert({
      where: { periodYear_periodMonth: { periodYear: year, periodMonth: month } },
      update:
        toStatus === 'SUBMITTED'
          ? { status: 'SUBMITTED', submittedById: Number.isFinite(performedById) ? performedById : null, submittedAt: new Date() }
          : { status: 'OPEN', submittedById: null, submittedAt: null },
      create: {
        periodYear: year,
        periodMonth: month,
        status: toStatus,
        submittedById: toStatus === 'SUBMITTED' && Number.isFinite(performedById) ? performedById : null,
        submittedAt: toStatus === 'SUBMITTED' ? new Date() : null,
      },
    });

    await logAudit({
      action: 'UPDATE',
      entityType: 'TIMESHEET_PERIOD',
      entityId: period.id,
      newValue: { status: period.status },
      description: `Timesheet for ${month}/${year} ${toStatus === 'SUBMITTED' ? 'sent to payroll' : 'reopened'}`,
      request,
    });

    return NextResponse.json(period);
  } catch (error: any) {
    console.error('POST /api/payroll/timesheet/submit error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update timesheet period' }, { status: 400 });
  }
}
