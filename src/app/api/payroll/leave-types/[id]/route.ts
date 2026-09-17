import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

// code is not editable — same reasoning as SalaryComponent.code:
// leaveEngine.ts and any future report could key off it, so it stays a
// stable handle once set.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Leave type not found' }, { status: 404 });

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.isPaid !== undefined) data.isPaid = !!body.isPaid;
    if (body.annualQuota !== undefined) data.annualQuota = body.annualQuota === '' || body.annualQuota === null ? null : Number(body.annualQuota);
    if (body.isActive !== undefined) data.isActive = !!body.isActive;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

    const leaveType = await prisma.leaveType.update({ where: { id }, data });
    await logAudit({ action: 'UPDATE', entityType: 'LEAVE_TYPE', entityId: leaveType.id, oldValue: existing, newValue: leaveType, description: `Leave type "${leaveType.name}" updated`, request });

    return NextResponse.json(leaveType);
  } catch (error: any) {
    console.error('PATCH /api/payroll/leave-types/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update leave type' }, { status: 400 });
  }
}

// LeaveRequest.leaveTypeId is ON DELETE CASCADE (see schema) at the
// requester's explicit direction — deleting a leave type here permanently
// deletes every leave request that used it too, approved/historical
// requests included, with no soft-delete or recovery step. Deactivating a
// type (PATCH isActive) remains the non-destructive alternative when the
// history should be kept.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Leave type not found' }, { status: 404 });

    const requestCount = await prisma.leaveRequest.count({ where: { leaveTypeId: id } });

    await prisma.leaveType.delete({ where: { id } });
    await logAudit({
      action: 'DELETE',
      entityType: 'LEAVE_TYPE',
      entityId: id,
      oldValue: existing,
      description: `Leave type "${existing.name}" deleted${requestCount > 0 ? ` — cascade-deleted ${requestCount} leave request(s) that referenced it` : ''}`,
      request,
    });

    return NextResponse.json({ success: true, cascadedRequestCount: requestCount });
  } catch (error: any) {
    console.error('DELETE /api/payroll/leave-types/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete leave type' }, { status: 400 });
  }
}
