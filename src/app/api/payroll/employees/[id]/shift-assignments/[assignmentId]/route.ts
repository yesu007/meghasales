import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { isShiftAssignmentUsedInClosedPayroll } from '@/lib/payroll/shiftEngine';

export const dynamic = 'force-dynamic';

function dayBefore(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

async function loadAssignment(employeeId: number, assignmentId: number) {
  const assignment = await prisma.employeeShiftAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.employeeId !== employeeId) return null;
  return assignment;
}

// Corrects a mistake (wrong shift, wrong effective date) on an assignment
// that hasn't yet been used to pay anyone — never a new history row, unlike
// POST. Because the chain of effectiveTo values is derived from the NEXT
// row's effectiveFrom (see POST), moving this row's effectiveFrom forward
// or back also has to re-derive the PREVIOUS row's effectiveTo, or the two
// would silently drift out of sync with each other.
export async function PATCH(request: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const assignmentId = parseInt(params.assignmentId, 10);
    const existing = await loadAssignment(employeeId, assignmentId);
    if (!existing) return NextResponse.json({ message: 'Shift assignment not found' }, { status: 404 });

    const body = await request.json();
    if (body.shiftId === undefined && body.effectiveFrom === undefined) {
      return NextResponse.json({ message: 'Nothing to update — provide shiftId and/or effectiveFrom' }, { status: 400 });
    }

    const usedAlready = await isShiftAssignmentUsedInClosedPayroll(prisma, employeeId, existing.effectiveFrom, existing.effectiveTo);
    if (usedAlready) {
      return NextResponse.json({ message: 'This assignment has already been used in a processed or paid payroll run and can no longer be edited — reopen that run first if a correction is truly needed' }, { status: 409 });
    }

    let newShiftId = existing.shiftId;
    if (body.shiftId !== undefined) {
      const shift = await prisma.shift.findUnique({ where: { id: Number(body.shiftId) } });
      if (!shift) return NextResponse.json({ message: 'Shift not found' }, { status: 404 });
      newShiftId = shift.id;
    }

    let newFrom = existing.effectiveFrom;
    if (body.effectiveFrom !== undefined) {
      newFrom = new Date(body.effectiveFrom);
      if (Number.isNaN(newFrom.getTime())) return NextResponse.json({ message: 'effectiveFrom is not a valid date' }, { status: 400 });
    }

    const siblings = await prisma.employeeShiftAssignment.findMany({ where: { employeeId }, orderBy: { effectiveFrom: 'asc' } });
    const idx = siblings.findIndex((s) => s.id === assignmentId);
    const prev = idx > 0 ? siblings[idx - 1] : null;
    const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;
    if (prev && newFrom <= prev.effectiveFrom) {
      return NextResponse.json({ message: `Effective date must be after the previous assignment's start date (${prev.effectiveFrom.toISOString().slice(0, 10)})` }, { status: 400 });
    }
    if (next && newFrom >= next.effectiveFrom) {
      return NextResponse.json({ message: `Effective date must be before the next assignment's start date (${next.effectiveFrom.toISOString().slice(0, 10)})` }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.employeeShiftAssignment.update({
        where: { id: assignmentId },
        data: { shiftId: newShiftId, effectiveFrom: newFrom },
        include: { shift: { select: { id: true, name: true, startTime: true, endTime: true, attendanceRequirement: true } } },
      });
      if (prev) {
        await tx.employeeShiftAssignment.update({ where: { id: prev.id }, data: { effectiveTo: dayBefore(newFrom) } });
      }
      return record;
    });

    await logAudit({ action: 'UPDATE', entityType: 'EMPLOYEE_SHIFT_ASSIGNMENT', entityId: assignmentId, oldValue: existing, newValue: updated, description: `Shift assignment ${assignmentId} for employee ${employeeId} updated`, request });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PATCH /api/payroll/employees/[id]/shift-assignments/[assignmentId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update shift assignment' }, { status: 400 });
  }
}

// Removes a mistaken assignment entirely — blocked once it's already been
// used to pay someone (see isShiftAssignmentUsedInClosedPayroll), same
// guard as PATCH. Re-links the chain around the gap: the previous
// assignment (if any) picks up whatever effectiveTo this one leaves behind
// — null (reopens as "current") if this was the last one, or the day
// before the next one's start if this was a row in the middle — so no
// employee is ever left with a silently broken history.
export async function DELETE(request: NextRequest, { params }: { params: { id: string; assignmentId: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_employees');
  if (denied) return denied;

  try {
    const employeeId = parseInt(params.id, 10);
    const assignmentId = parseInt(params.assignmentId, 10);
    const existing = await loadAssignment(employeeId, assignmentId);
    if (!existing) return NextResponse.json({ message: 'Shift assignment not found' }, { status: 404 });

    const usedAlready = await isShiftAssignmentUsedInClosedPayroll(prisma, employeeId, existing.effectiveFrom, existing.effectiveTo);
    if (usedAlready) {
      return NextResponse.json({ message: 'This assignment has already been used in a processed or paid payroll run and cannot be deleted — reopen that run first if it truly needs correcting' }, { status: 409 });
    }

    const siblings = await prisma.employeeShiftAssignment.findMany({ where: { employeeId }, orderBy: { effectiveFrom: 'asc' } });
    const idx = siblings.findIndex((s) => s.id === assignmentId);
    const prev = idx > 0 ? siblings[idx - 1] : null;
    const next = idx < siblings.length - 1 ? siblings[idx + 1] : null;

    await prisma.$transaction(async (tx) => {
      await tx.employeeShiftAssignment.delete({ where: { id: assignmentId } });
      if (prev) {
        await tx.employeeShiftAssignment.update({ where: { id: prev.id }, data: { effectiveTo: next ? dayBefore(next.effectiveFrom) : null } });
      }
    });

    await logAudit({ action: 'DELETE', entityType: 'EMPLOYEE_SHIFT_ASSIGNMENT', entityId: assignmentId, oldValue: existing, description: `Shift assignment ${assignmentId} for employee ${employeeId} deleted`, request });

    return NextResponse.json({ message: 'Shift assignment deleted' });
  } catch (error: any) {
    console.error('DELETE /api/payroll/employees/[id]/shift-assignments/[assignmentId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to delete shift assignment' }, { status: 400 });
  }
}
