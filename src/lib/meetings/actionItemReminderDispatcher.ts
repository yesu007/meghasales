import dayjs from 'dayjs';
import prisma from '@/lib/prisma';
import { ACTION_ITEM_RESOLVED_STATUSES, MAX_REMINDER_ATTEMPTS, NotificationEventType, ReminderRecipientType } from './constants';
import { dispatchTemplatedNotification, TemplateNotFoundError } from './notificationTemplates';

class ReminderSkippedError extends Error {}

const BATCH_SIZE = 100;

// Pure and exported specifically to be unit-tested, same reasoning
// AdminTicket's dispatcher.ts exports formatDaysRemaining.
export function classifyReminderEventType(offsetDays: number, recipientType: ReminderRecipientType): NotificationEventType {
  if (offsetDays < 0) return 'ACTION_ITEM_DUE_SOON';
  return recipientType === 'ORGANIZER' ? 'ACTION_ITEM_ESCALATED' : 'ACTION_ITEM_OVERDUE';
}

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL || '';
  return `${base}${path}`;
}

interface DueReminderRow {
  id: number;
  actionItemId: number;
  offsetDays: number;
  channel: string;
  recipientType: string;
  attemptCount: number;
}

// Runs on every cron tick (and on-demand from the action-items list),
// mirroring deadlineReminders.ts's plain sequential-loop model rather than
// AdminTicket's raw-SQL FOR UPDATE SKIP LOCKED transaction — this dispatcher
// makes real SMTP calls (via mail.ts) per row, and holding DB row locks
// across that network I/O would be the wrong trade-off at this app's scale.
export async function dispatchActionItemReminders(now: Date = new Date()): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  const due = (await prisma.actionItemReminder.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH_SIZE,
  })) as DueReminderRow[];

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const reminder of due) {
    try {
      await deliverReminder(reminder);
      await prisma.actionItemReminder.update({
        where: { id: reminder.id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null },
      });
      sent += 1;
    } catch (error) {
      if (error instanceof ReminderSkippedError || error instanceof TemplateNotFoundError) {
        await prisma.actionItemReminder.update({
          where: { id: reminder.id },
          data: { status: 'SKIPPED', lastError: error.message },
        });
        skipped += 1;
        continue;
      }

      const attemptCount = reminder.attemptCount + 1;
      const status = attemptCount >= MAX_REMINDER_ATTEMPTS ? 'FAILED' : 'PENDING';
      const message = error instanceof Error ? error.message : String(error);
      await prisma.actionItemReminder.update({
        where: { id: reminder.id },
        data: { attemptCount, status, lastError: message.slice(0, 500) },
      });
      if (status === 'FAILED') failed += 1;
    }
  }

  return { processed: due.length, sent, failed, skipped };
}

async function deliverReminder(reminder: DueReminderRow): Promise<void> {
  const actionItem = await prisma.actionItem.findUnique({
    where: { id: reminder.actionItemId },
    select: {
      id: true,
      description: true,
      priority: true,
      dueDate: true,
      status: true,
      assignedToId: true,
      meeting: { select: { organizerId: true, title: true } },
    },
  });
  if (!actionItem) throw new ReminderSkippedError('action item no longer exists');
  if ((ACTION_ITEM_RESOLVED_STATUSES as string[]).includes(actionItem.status)) throw new ReminderSkippedError('action item already resolved');

  const recipientUserId = reminder.recipientType === 'ASSIGNEE' ? actionItem.assignedToId : actionItem.meeting.organizerId;
  if (!recipientUserId) throw new ReminderSkippedError('no resolvable recipient');

  const eventType = classifyReminderEventType(reminder.offsetDays, reminder.recipientType as ReminderRecipientType);
  const vars = {
    description: actionItem.description,
    priority: actionItem.priority,
    dueDate: dayjs(actionItem.dueDate).format('DD MMM YYYY'),
    meetingTitle: actionItem.meeting.title,
    actionUrl: appUrl(`/dashboard/action-items/${actionItem.id}`),
  };

  await dispatchTemplatedNotification({
    eventType,
    channel: reminder.channel as 'IN_APP' | 'EMAIL',
    recipientUserId,
    entityType: 'ACTION_ITEM',
    entityId: actionItem.id,
    vars,
  });

  // escalationLevel is exclusively system-owned (never contended by a human
  // edit), so it's incremented unconditionally with no optimistic-lock
  // gate. Guarding on IN_APP only, since the materializer always creates
  // that row alongside EMAIL for the same tier, avoids double-incrementing
  // once per channel for what is conceptually a single escalation step.
  if (eventType === 'ACTION_ITEM_ESCALATED' && reminder.channel === 'IN_APP') {
    await prisma.actionItem.update({ where: { id: actionItem.id }, data: { escalationLevel: { increment: 1 } } });
  }
}
