import prisma from '@/lib/prisma';
import { DEFAULT_REMINDER_OFFSETS } from './constants';

// Called on ticket create/update whenever the due date is set or changes.
// Only PENDING reminders are ever erased and recomputed — SENT/FAILED/
// CANCELLED rows are left alone so delivery history survives a due-date
// edit and a reminder that already fired never fires twice for the same
// offset (enforced by the (ticketId, offsetDays, channel, recipientType)
// unique constraint below).
export async function materializeReminders(
  ticketId: number,
  dueDate: Date | null,
  categoryEscalationRoleId: number | null
): Promise<void> {
  await prisma.adminTicketReminder.deleteMany({ where: { ticketId, status: 'PENDING' } });
  if (!dueDate) return;

  for (const offset of DEFAULT_REMINDER_OFFSETS) {
    const scheduledAt = scheduleAt9AmIst(addDays(dueDate, offset.offsetDays));

    const existing = await prisma.adminTicketReminder.findUnique({
      where: {
        ticketId_offsetDays_channel_recipientType: {
          ticketId,
          offsetDays: offset.offsetDays,
          channel: 'IN_APP',
          recipientType: offset.recipientType,
        },
      },
    });
    if (existing) continue; // already SENT/FAILED for this offset — don't regenerate

    await prisma.adminTicketReminder.create({
      data: {
        ticketId,
        offsetDays: offset.offsetDays,
        channel: 'IN_APP',
        recipientType: offset.recipientType,
        recipientRef: offset.recipientType === 'ROLE' && categoryEscalationRoleId ? String(categoryEscalationRoleId) : null,
        scheduledAt,
        status: 'PENDING',
      },
    });
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Sending a compliance reminder at 3 AM is how a feature gets switched off
// in week two — always land at 9:00 AM office time (IST, UTC+5:30) rather
// than whatever hour the due-date arithmetic happens to produce.
function scheduleAt9AmIst(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 3, 30, 0));
}
