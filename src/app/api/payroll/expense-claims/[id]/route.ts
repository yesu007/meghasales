import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// A linear workflow, same shape as LeaveRequest's own VALID_TRANSITIONS —
// SUBMITTED is the only state a decision moves out of (Approved/Rejected),
// and PAID is a separate, later step reachable only from APPROVED — kept
// as its own explicit transition (not folded into "Approve") since
// reimbursement payment happens on its own schedule, per the task's
// "Payment can be processed separately from monthly salary based on
// company policy." REJECTED/PAID are terminal — no "return for
// correction" state exists in this workflow, matching LeaveRequest's own
// "just apply again" convention.
const VALID_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: [],
  PAID: [],
};

const PAYMENT_TYPES = ['HAND_CASH', 'BANK_TRANSFER'];

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('approve_expense_claims');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const existing = await prisma.expenseClaim.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Reimbursement not found' }, { status: 404 });

    const body = await request.json();
    const toStatus = body.status;
    if (!toStatus) return NextResponse.json({ message: 'status is required' }, { status: 400 });
    if (!VALID_TRANSITIONS[existing.status]?.includes(toStatus)) {
      return NextResponse.json({ message: `Cannot move a reimbursement from ${existing.status} to ${toStatus}` }, { status: 400 });
    }
    if (toStatus === 'REJECTED' && !body.rejectionReason) {
      return NextResponse.json({ message: 'rejectionReason is required to reject a reimbursement' }, { status: 400 });
    }
    if (toStatus === 'PAID' && !PAYMENT_TYPES.includes(body.paymentType)) {
      return NextResponse.json({ message: `paymentType is required to mark a reimbursement as paid (${PAYMENT_TYPES.join(' or ')})` }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);

    const data: Record<string, unknown> = { status: toStatus, version: { increment: 1 } };
    if (toStatus === 'APPROVED') {
      data.decidedById = performedById;
      data.approvedAt = new Date();
    } else if (toStatus === 'REJECTED') {
      data.decidedById = performedById;
      data.rejectedAt = new Date();
      data.rejectionReason = body.rejectionReason;
    } else if (toStatus === 'PAID') {
      data.paidAt = new Date();
      data.paymentType = body.paymentType;
    }

    const updateResult = await prisma.expenseClaim.updateMany({ where: { id, version: existing.version }, data });
    if (updateResult.count === 0) {
      return NextResponse.json({ message: 'This reimbursement was modified elsewhere — reload and try again' }, { status: 409 });
    }

    const claim = await prisma.expenseClaim.findUniqueOrThrow({
      where: { id },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
        category: { select: { id: true, name: true } },
        lead: { select: { id: true, companyName: true } },
        project: { select: { id: true, projectName: true } },
        product: { select: { id: true, productName: true } },
      },
    });
    await logAudit({ action: 'UPDATE', entityType: 'EXPENSE_CLAIM', entityId: id, newValue: { status: claim.status }, description: `Reimbursement ${id} moved to ${claim.status}`, request });

    return NextResponse.json(claim);
  } catch (error: any) {
    console.error('PATCH /api/payroll/expense-claims/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update reimbursement' }, { status: 400 });
  }
}
