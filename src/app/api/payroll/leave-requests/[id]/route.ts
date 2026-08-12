import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}
function checkPermission(session: any, permission: string): boolean {
  const role = session?.user?.role;
  const permissions: string[] = session?.user?.permissions || [];
  return role === 'ADMIN' || permissions.includes(permission);
}

// A linear workflow, not AdminTicket/PayrollRun's reversible matrix —
// PENDING is the only state anything moves out of by decision (APPROVED/
// REJECTED, approver-only), and CANCELLED is reachable from PENDING or
// APPROVED but only by the request's own owner withdrawing it (or an
// approver on their behalf). REJECTED/CANCELLED are terminal; the
// employee just applies again rather than reopening one.
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
};
const APPROVER_ONLY_STATUSES = ['APPROVED', 'REJECTED'];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  try {
    const id = parseInt(params.id);
    const existing = await prisma.leaveRequest.findUnique({ where: { id }, include: { employee: true } });
    if (!existing) return NextResponse.json({ message: 'Leave request not found' }, { status: 404 });

    const body = await request.json();
    const toStatus = body.status;
    if (!toStatus) return NextResponse.json({ message: 'status is required' }, { status: 400 });
    if (!VALID_TRANSITIONS[existing.status]?.includes(toStatus)) {
      return NextResponse.json({ message: `Cannot move a leave request from ${existing.status} to ${toStatus}` }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);
    const isOwner = performedById != null && existing.employee.userId === performedById;
    const canApprove = checkPermission(session, 'approve_leave');

    if (APPROVER_ONLY_STATUSES.includes(toStatus) && !canApprove) {
      return NextResponse.json({ message: 'Approving or rejecting a leave request requires the approve_leave permission' }, { status: 403 });
    }
    if (toStatus === 'CANCELLED' && !isOwner && !canApprove) {
      return NextResponse.json({ message: 'You can only cancel your own leave requests' }, { status: 403 });
    }
    // An approver cancelling someone else's request is acting on their
    // behalf without them having asked to withdraw it — unlike the owner's
    // own "Cancel" (self-explanatory) or an APPROVED/REJECTED decision
    // (decisionNote is offered but optional there), this one requires a
    // reason so the employee isn't just told their approved leave vanished.
    const isApproverCancellingOnBehalf = toStatus === 'CANCELLED' && canApprove && !isOwner;
    if (isApproverCancellingOnBehalf && !body.decisionNote) {
      return NextResponse.json({ message: 'A reason is required when cancelling a leave request on behalf of an employee' }, { status: 400 });
    }

    const data: Record<string, unknown> = { status: toStatus, version: { increment: 1 } };
    if (body.decisionNote) data.decisionNote = body.decisionNote;
    if (APPROVER_ONLY_STATUSES.includes(toStatus) || isApproverCancellingOnBehalf) {
      data.approvedById = performedById;
      data.approvedAt = new Date();
    }

    const updateResult = await prisma.leaveRequest.updateMany({ where: { id, version: existing.version }, data });
    if (updateResult.count === 0) {
      return NextResponse.json({ message: 'Leave request was modified by someone else — reload and try again' }, { status: 409 });
    }

    const leaveRequest = await prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
    await logAudit({ action: 'UPDATE', entityType: 'LEAVE_REQUEST', entityId: id, newValue: { status: leaveRequest.status }, description: `Leave request ${id} moved to ${leaveRequest.status}`, request });

    return NextResponse.json(leaveRequest);
  } catch (error: any) {
    console.error('PATCH /api/payroll/leave-requests/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update leave request' }, { status: 400 });
  }
}
