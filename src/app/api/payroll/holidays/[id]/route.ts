import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// Soft-deactivate rather than a hard delete — a holiday that already fed
// into a past timesheet's Paid Holiday hours shouldn't retroactively
// disappear from history, the same reasoning SalaryComponent/LeaveType use
// isActive for instead of removing the row outright.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const id = parseInt(params.id, 10);
    const holiday = await prisma.paidHoliday.update({ where: { id }, data: { isActive: false } });
    await logAudit({ action: 'DELETE', entityType: 'PAID_HOLIDAY', entityId: id, description: `Holiday "${holiday.name}" removed`, request });
    return NextResponse.json(holiday);
  } catch (error: any) {
    if (error.code === 'P2025') return NextResponse.json({ message: 'Holiday not found' }, { status: 404 });
    console.error('DELETE /api/payroll/holidays/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to remove holiday' }, { status: 400 });
  }
}
