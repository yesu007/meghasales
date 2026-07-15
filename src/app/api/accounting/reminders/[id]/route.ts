import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const existing = await prisma.paymentReminder.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ message: 'Reminder not found' }, { status: 404 });

    const reminder = await prisma.paymentReminder.update({
      where: { id },
      data: {
        ...(body.status !== undefined && {
          status: body.status,
          ...(body.status === 'FOLLOWED_UP' && { followedUpAt: new Date(), followedUpById: body.followedUpById ? parseInt(body.followedUpById) : null }),
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });

    await logAudit({ action: 'UPDATE', entityType: 'PAYMENT_REMINDER', entityId: id, oldValue: existing, newValue: reminder, description: `Reminder ${reminder.reminderType} for invoice #${reminder.invoiceId} marked ${reminder.status}`, request });

    return NextResponse.json(reminder);
  } catch (error: any) {
    return NextResponse.json({ message: error.message || 'Failed to update reminder' }, { status: 400 });
  }
}
