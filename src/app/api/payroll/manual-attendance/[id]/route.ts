import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { checkPermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { MANUAL_VALID_TRANSITIONS } from '@/lib/payroll/manualAttendance';
import { notifyManualAttendanceDecision } from '@/lib/payroll/manualAttendanceNotify';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

const APPROVER_ONLY = ['APPROVED', 'REJECTED'];

// Decide or withdraw a request — same rules as leave requests: approve/
// reject needs approve_manual_attendance (and not on your own request);
// the owner can cancel their own PENDING one; an approver cancelling an
// APPROVED one on someone's behalf must give a reason.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const id = parseInt(params.id, 10);
    const existing = await prisma.manualAttendanceRequest.findUnique({ where: { id }, include: { employee: true } });
    if (!existing) return NextResponse.json({ message: 'Manual attendance request not found' }, { status: 404 });

    const body = await request.json();
    const toStatus = String(body.status || '');
    const note = body.decisionNote ? String(body.decisionNote).trim().slice(0, 500) : '';
    if (!MANUAL_VALID_TRANSITIONS[existing.status]?.includes(toStatus)) {
      return NextResponse.json({ message: `Cannot move a manual attendance request from ${existing.status} to ${toStatus || '(none)'}` }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);
    const isOwner = performedById != null && existing.employee.userId === performedById;
    const canApprove = checkPermission(session, 'approve_manual_attendance');

    if (APPROVER_ONLY.includes(toStatus)) {
      if (!canApprove) return NextResponse.json({ message: 'Approving or rejecting manual attendance requires the approve_manual_attendance permission' }, { status: 403 });
      if (isOwner) return NextResponse.json({ message: 'You cannot approve or reject your own manual attendance' }, { status: 403 });
      if (toStatus === 'REJECTED' && !note) return NextResponse.json({ message: 'A reason is required when rejecting' }, { status: 400 });
    }
    if (toStatus === 'CANCELLED') {
      if (!isOwner && !canApprove) return NextResponse.json({ message: 'You can only cancel your own manual attendance requests' }, { status: 403 });
      if (isOwner && existing.status !== 'PENDING') return NextResponse.json({ message: 'An approved request can only be cancelled by an approver' }, { status: 403 });
      if (!isOwner && !note) return NextResponse.json({ message: 'A reason is required when cancelling on behalf of an employee' }, { status: 400 });
    }

    const data: Record<string, unknown> = { status: toStatus, version: { increment: 1 } };
    if (note) data.decisionNote = note;
    if (!isOwner) { data.decidedById = performedById; data.decidedAt = new Date(); }

    const updated = await prisma.manualAttendanceRequest.updateMany({ where: { id, version: existing.version }, data });
    if (updated.count === 0) return NextResponse.json({ message: 'This request was changed by someone else — reload and try again' }, { status: 409 });

    const result = await prisma.manualAttendanceRequest.findUniqueOrThrow({ where: { id } });
    const date = result.attendanceDate.toISOString().slice(0, 10);
    await logAudit({
      action: 'UPDATE',
      entityType: 'MANUAL_ATTENDANCE_REQUEST',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: result.status, decisionNote: result.decisionNote },
      description: `Manual attendance ${id} (${existing.employee.employeeCode}, ${date}) moved ${existing.status} → ${result.status}`,
      request,
    });
    if (!isOwner) await notifyManualAttendanceDecision(id, existing.employee.userId, date, result.status, result.decisionNote);
    return NextResponse.json({ ...result, attendanceDate: date });
  } catch (error: any) {
    console.error('PATCH /api/payroll/manual-attendance/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update manual attendance request' }, { status: 400 });
  }
}
