import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { refreshCommonWorkingDays } from '@/lib/payroll/weekOffConfig';

export const dynamic = 'force-dynamic';

// Removing a Common Working Saturday un-pauses the rotation: that Saturday
// is its team's week off again and every later Saturday shifts back.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('delete_timesheet');
  if (denied) return denied;

  try {
    const id = parseInt(params.id, 10);
    const row = await prisma.commonWorkingDay.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ message: 'Common Working Day not found' }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.commonWorkingDay.delete({ where: { id } });
      await refreshCommonWorkingDays(tx);
    });
    const date = row.date.toISOString().slice(0, 10);
    await logAudit({
      action: 'DELETE',
      entityType: 'COMMON_WORKING_DAY',
      entityId: id,
      oldValue: { date, team: row.team, carryForwardDate: row.carryForwardDate.toISOString().slice(0, 10) },
      description: `Common Working Saturday ${date} removed — rotation restored`,
      request,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/payroll/common-working-days/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to remove Common Working Day' }, { status: 400 });
  }
}
