import prisma from '@/lib/prisma';
import { ActionItemPriority, NOTIFICATION_CHANNELS, SLA_OFFSETS_BY_PRIORITY } from './constants';

// Called on action-item create/update whenever dueDate or priority changes.
// Only PENDING reminders are ever erased and recomputed — SENT/FAILED/
// CANCELLED rows are left alone so delivery history survives an edit and a
// reminder that already fired never fires twice for the same offset
// (enforced by the (actionItemId, offsetDays, channel, recipientType)
// unique constraint below). Same shape as AdminTicket's materializeReminders.
export async function materializeActionItemReminders(actionItemId: number, dueDate: Date, priority: string): Promise<void> {
  await prisma.actionItemReminder.deleteMany({ where: { actionItemId, status: 'PENDING' } });

  const offsets = SLA_OFFSETS_BY_PRIORITY[priority as ActionItemPriority] ?? SLA_OFFSETS_BY_PRIORITY.MEDIUM;

  for (const offset of offsets) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const scheduledAt = scheduleAt9AmIst(addDays(dueDate, offset.offsetDays));

      const existing = await prisma.actionItemReminder.findUnique({
        where: {
          actionItemId_offsetDays_channel_recipientType: {
            actionItemId,
            offsetDays: offset.offsetDays,
            channel,
            recipientType: offset.recipientType,
          },
        },
      });
      if (existing) continue; // already SENT/FAILED/CANCELLED for this offset — don't regenerate

      await prisma.actionItemReminder.create({
        data: {
          actionItemId,
          offsetDays: offset.offsetDays,
          channel,
          recipientType: offset.recipientType,
          scheduledAt,
          status: 'PENDING',
        },
      });
    }
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
