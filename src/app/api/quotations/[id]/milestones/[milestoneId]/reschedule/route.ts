import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Moves a payment milestone's date — before its invoice exists this just
// slides QuotationPaymentMilestone.scheduledDate (when the cron will invoice
// it); once invoiced, "the milestone date" is the invoice's own due date, so
// this moves that instead. Blocked once the invoice is fully PAID (locked,
// same convention as Expense Budgets' APPROVED gate); a PARTIALLY_PAID
// invoice can still move, but only with a reason on record, since money has
// already moved against it.
export async function POST(request: NextRequest, { params }: { params: { id: string; milestoneId: string } }) {
  const denied = await requirePermission('manage_quotations');
  if (denied) return denied;

  try {
    const quotationId = parseInt(params.id);
    const milestoneId = parseInt(params.milestoneId);
    const body = await request.json();

    if (!body.newScheduledDate) return NextResponse.json({ message: 'newScheduledDate is required' }, { status: 400 });
    const newDate = new Date(body.newScheduledDate);
    if (Number.isNaN(newDate.getTime())) return NextResponse.json({ message: 'newScheduledDate is not a valid date' }, { status: 400 });

    const reason = String(body.reason || '').trim();

    const milestone = await prisma.quotationPaymentMilestone.findFirst({
      where: { id: milestoneId, quotationId },
      include: { invoice: { select: { id: true, status: true } } },
    });
    if (!milestone) return NextResponse.json({ message: 'Milestone not found' }, { status: 404 });

    if (milestone.invoice) {
      if (milestone.invoice.status === 'PAID') {
        return NextResponse.json({ message: "This milestone's invoice is fully paid — its date can no longer be rescheduled" }, { status: 400 });
      }
      if (milestone.invoice.status === 'PARTIALLY_PAID' && !reason) {
        return NextResponse.json({ message: 'A reason is required to reschedule a milestone that has already been partially paid' }, { status: 400 });
      }
    }

    const [updatedMilestone] = await prisma.$transaction([
      prisma.quotationPaymentMilestone.update({
        where: { id: milestoneId },
        data: { scheduledDate: newDate, rescheduledAt: new Date(), rescheduleReason: reason || null },
      }),
      ...(milestone.invoice ? [prisma.invoice.update({ where: { id: milestone.invoice.id }, data: { dueDate: newDate } })] : []),
    ]);

    await logAudit({
      action: 'UPDATE',
      entityType: 'QUOTATION_PAYMENT_MILESTONE',
      entityId: milestone.id,
      oldValue: { scheduledDate: milestone.scheduledDate },
      newValue: { scheduledDate: newDate },
      description: `Milestone ${milestone.sequence} of quotation #${quotationId} rescheduled${reason ? ` — ${reason}` : ''}`,
      request,
    });

    return NextResponse.json(updatedMilestone);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to reschedule milestone' }, { status: 400 });
  }
}
