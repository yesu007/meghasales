import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { ATTENDANCE_REQUIREMENTS } from '@/lib/payroll/shiftEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_payroll');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const shift = await prisma.shift.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } });
    if (!shift) return NextResponse.json({ message: 'Shift not found' }, { status: 404 });
    return NextResponse.json(shift);
  } catch (error) {
    console.error('GET /api/payroll/shifts/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.shift.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Shift not found' }, { status: 404 });

    const body = await request.json();
    if (body.attendanceRequirement && !ATTENDANCE_REQUIREMENTS.includes(body.attendanceRequirement)) {
      return NextResponse.json({ message: `attendanceRequirement must be one of ${ATTENDANCE_REQUIREMENTS.join(', ')}` }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.startTime !== undefined) data.startTime = body.startTime;
    if (body.endTime !== undefined) data.endTime = body.endTime;
    if (body.bufferMinutes !== undefined) data.bufferMinutes = Number(body.bufferMinutes);
    if (body.earlyLogoutBufferMinutes !== undefined) data.earlyLogoutBufferMinutes = Number(body.earlyLogoutBufferMinutes);
    if (body.attendanceRequirement !== undefined) data.attendanceRequirement = body.attendanceRequirement;
    if (body.lateRuleMinutes !== undefined) data.lateRuleMinutes = body.lateRuleMinutes != null ? Number(body.lateRuleMinutes) : null;
    if (body.halfDayRuleMinutes !== undefined) data.halfDayRuleMinutes = body.halfDayRuleMinutes != null ? Number(body.halfDayRuleMinutes) : null;
    if (body.lopRuleMinutes !== undefined) data.lopRuleMinutes = body.lopRuleMinutes != null ? Number(body.lopRuleMinutes) : null;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    const shift = await prisma.shift.update({ where: { id }, data });

    await logAudit({ action: 'UPDATE', entityType: 'SHIFT', entityId: shift.id, oldValue: existing, newValue: shift, description: `Shift "${shift.name}" updated`, request });

    return NextResponse.json(shift);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ message: 'A shift with that name already exists' }, { status: 409 });
    }
    console.error('PATCH /api/payroll/shifts/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update shift' }, { status: 400 });
  }
}

// Shifts have no historical dependents of their own — unlike a Salary
// Structure (which Payslips reference by id forever), an
// EmployeeShiftAssignment is the only thing that points at a Shift, so a
// real delete is safe once no assignment references it.
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.shift.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } });
    if (!existing) return NextResponse.json({ message: 'Shift not found' }, { status: 404 });

    if (existing._count.assignments > 0) {
      return NextResponse.json({ message: 'This shift is assigned to one or more employees and cannot be deleted. Deactivate it instead.' }, { status: 409 });
    }

    await prisma.shift.delete({ where: { id } });

    await logAudit({ action: 'DELETE', entityType: 'SHIFT', entityId: id, oldValue: existing, description: `Shift "${existing.name}" deleted`, request });

    return NextResponse.json({ message: 'Shift deleted' });
  } catch (error: any) {
    console.error('DELETE /api/payroll/shifts/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete shift' }, { status: 400 });
  }
}
