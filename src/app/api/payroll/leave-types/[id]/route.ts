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

// LeaveRequest.leaveTypeId has no onDelete: Cascade (see schema) — on
// purpose. A leave type accumulates real, permanent employee leave
// history; deleting it out from under existing requests would either
// violate that foreign key or silently wipe attendance records, neither of
// which is ever the right outcome. So once any request references it, the
// type can only be deactivated (via PATCH isActive), never deleted.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_salary_structures');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.leaveType.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Leave type not found' }, { status: 404 });

    const requestCount = await prisma.leaveRequest.count({ where: { leaveTypeId: id } });
    if (requestCount > 0) {
      return NextResponse.json(
        { message: `Cannot delete "${existing.name}" — ${requestCount} leave request(s) reference it. Mark it inactive from Edit instead.` },
        { status: 409 },
      );
    }

    await prisma.leaveType.delete({ where: { id } });
    await logAudit({ action: 'DELETE', entityType: 'LEAVE_TYPE', entityId: id, oldValue: existing, description: `Leave type "${existing.name}" deleted`, request });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE /api/payroll/leave-types/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete leave type' }, { status: 400 });
  }
}
