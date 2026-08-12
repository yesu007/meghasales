import prisma from '@/lib/prisma';
import dayjs from 'dayjs';
import { Prisma } from '@prisma/client';
import { MAX_REMINDER_ATTEMPTS } from './constants';
import { sendPushToUser, isPushConfigured } from '@/lib/push';

const BATCH_SIZE = 100;

class ReminderSkippedError extends Error {}
class ReminderChannelNotConfiguredError extends Error {}

interface DueReminderRow {
  id: number;
  ticketId: number;
  channel: string;
  recipientType: string;
  recipientRef: string | null;
  attemptCount: number;
}

interface PushQueueItem {
  userId: number;
  title: string;
  body: string;
  url: string;
}

// "3 days remaining" / "due today" / "overdue by 2 days" — the phrasing
// the in-app notification and the push body both use, computed at send
// time (not at schedule time) so a -7-day advance reminder that gets
// retried a day late still reports the true remaining time.
export function formatDaysRemaining(dueDate: Date, now: Date): string {
  const diff = dayjs(dueDate).startOf('day').diff(dayjs(now).startOf('day'), 'day');
  if (diff > 0) return `${diff} day${diff === 1 ? '' : 's'} remaining`;
  if (diff === 0) return 'due today';
  const overdueDays = Math.abs(diff);
  return `overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`;
}

// Runs on every cron tick (and on-demand from the tickets list) rather than
// a fixed daily slot, so a reminder missed during downtime goes out on
// recovery instead of vanishing. FOR UPDATE SKIP LOCKED lets multiple
// concurrent invocations (two app instances, or cron overlapping an
// on-demand call) each claim a disjoint batch instead of double-sending;
// it only actually protects the batch while everything stays inside one
// transaction, so the whole select+process+update loop below runs in a
// single prisma.$transaction rather than one transaction per row.
export async function dispatchDueReminders(now: Date = new Date()): Promise<{ processed: number; sent: number; failed: number; skipped: number; pushed: number }> {
  const pushQueue: PushQueueItem[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<DueReminderRow[]>`
      SELECT id, ticket_id AS "ticketId", channel, recipient_type AS "recipientType",
             recipient_ref AS "recipientRef", attempt_count AS "attemptCount"
      FROM admin_ticket_reminders
      WHERE status = 'PENDING' AND scheduled_at <= ${now}
      ORDER BY scheduled_at
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const reminder of due) {
      try {
        await deliverReminder(tx, reminder, now, pushQueue);
        await tx.adminTicketReminder.update({
          where: { id: reminder.id },
          data: { status: 'SENT', sentAt: new Date(), lastError: null },
        });
        sent += 1;
      } catch (error) {
        if (error instanceof ReminderSkippedError) {
          await tx.adminTicketReminder.update({
            where: { id: reminder.id },
            data: { status: 'SKIPPED', lastError: error.message },
          });
          skipped += 1;
          continue;
        }

        const attemptCount = reminder.attemptCount + 1;
        const status = attemptCount >= MAX_REMINDER_ATTEMPTS ? 'FAILED' : 'PENDING';
        const message = error instanceof Error ? error.message : String(error);
        await tx.adminTicketReminder.update({
          where: { id: reminder.id },
          data: { attemptCount, status, lastError: message.slice(0, 500) },
        });
        if (status === 'FAILED') failed += 1;
      }
    }

    return { processed: due.length, sent, failed, skipped };
  });

  // Push sends are best-effort network calls to an external push service —
  // deliberately done after the transaction commits so a slow/unreachable
  // push provider never holds the reminder-row locks open. A push failure
  // here never un-sends the IN_APP notification already committed above;
  // it's a bonus delivery channel, not the record of truth.
  let pushed = 0;
  if (isPushConfigured()) {
    for (const item of pushQueue) {
      try {
        const { sent: n } = await sendPushToUser(item.userId, { title: item.title, body: item.body, url: item.url });
        pushed += n;
      } catch (error) {
        console.error(`Push send failed for user ${item.userId}:`, error);
      }
    }
  }

  return { ...result, pushed };
}

async function deliverReminder(tx: Prisma.TransactionClient, reminder: DueReminderRow, now: Date, pushQueue: PushQueueItem[]): Promise<void> {
  const ticket = await tx.adminTicket.findUnique({
    where: { id: reminder.ticketId },
    select: { assignedToId: true, createdById: true, title: true, ticketNo: true, dueDate: true },
  });
  if (!ticket) throw new ReminderSkippedError('ticket no longer exists');

  const recipientUserIds = await resolveRecipientUserIds(tx, reminder.recipientType, reminder.recipientRef, ticket);
  if (recipientUserIds.length === 0) throw new ReminderSkippedError('no resolvable recipient');

  // IN_APP is the only channel with a real sender in this app today — see
  // the module survey notes: no email/SMS/WhatsApp provider is wired up
  // anywhere in the codebase, so those channels fail (then retry, then
  // dead-letter) rather than silently pretending to send. Browser push
  // rides along with every IN_APP delivery instead of being a separate
  // materialized channel — it's a delivery bonus for whoever has opted in
  // (see PushSubscription/push.ts), not a distinct reminder schedule.
  if (reminder.channel !== 'IN_APP') {
    throw new ReminderChannelNotConfiguredError(`channel ${reminder.channel} has no configured provider`);
  }

  const remainingText = ticket.dueDate ? formatDaysRemaining(ticket.dueDate, now) : null;
  const message = `Admin ticket ${ticket.ticketNo} — ${ticket.title}${
    ticket.dueDate ? ` — ${remainingText} (due ${dayjs(ticket.dueDate).format('DD MMM YYYY')})` : ''
  }`;

  await tx.notification.createMany({
    data: recipientUserIds.map((userId) => ({
      userId,
      title: 'Admin Ticket Reminder',
      message,
      type: 'ADMIN_TICKET_REMINDER',
      channel: 'IN_APP',
      entityType: 'ADMIN_TICKET',
      entityId: reminder.ticketId,
    })),
  });

  const pushBody = remainingText ? `${ticket.title} — ${remainingText}` : ticket.title;
  for (const userId of recipientUserIds) {
    pushQueue.push({
      userId,
      title: `Ticket ${ticket.ticketNo} deadline`,
      body: pushBody,
      url: `/dashboard/admin-ticket/${reminder.ticketId}`,
    });
  }
}

async function resolveRecipientUserIds(
  tx: Prisma.TransactionClient,
  recipientType: string,
  recipientRef: string | null,
  ticket: { assignedToId: number | null; createdById: number | null }
): Promise<number[]> {
  switch (recipientType) {
    case 'ASSIGNEE':
      return ticket.assignedToId ? [ticket.assignedToId] : [];
    case 'CREATOR':
      return ticket.createdById ? [ticket.createdById] : [];
    case 'ROLE': {
      if (!recipientRef) return [];
      const roleId = parseInt(recipientRef, 10);
      if (Number.isNaN(roleId)) return [];
      const users = await tx.user.findMany({ where: { roleId, isActive: true }, select: { id: true } });
      return users.map((u) => u.id);
    }
    case 'EXPLICIT': {
      if (!recipientRef) return [];
      const userId = parseInt(recipientRef, 10);
      return Number.isNaN(userId) ? [] : [userId];
    }
    default:
      return [];
  }
}
