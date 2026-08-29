import prisma from '@/lib/prisma';
import { isMailConfigured, sendMail } from '@/lib/mail';
import { NotificationChannel, NotificationEventType } from './constants';

export class TemplateNotFoundError extends Error {}

// Thrown specifically when sendMail() itself fails (bad SMTP credentials,
// unreachable host, ...) — distinct from a per-recipient issue like "no
// email on file" or a missing template, so callers that loop over many
// reminders (the SLA dispatcher) can tell a systemic transport failure
// apart from a one-off skip and stop retrying it N times in the same run.
export class EmailTransportError extends Error {}

// {{token}} substitution — unmatched tokens render as an empty string
// rather than being left in place, since a template referencing a token
// this event type doesn't supply shouldn't leak "{{typo}}" into a real
// notification.
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

// Employee.email is the address of record, falling back to User.email for
// the rare case where no Employee row exists yet — same resolution as
// deadlineReminders.ts's resolveRecipientEmail.
async function resolveUserEmail(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, employee: { select: { email: true } } },
  });
  return user?.employee?.email || user?.email || null;
}

export interface DispatchTemplatedNotificationInput {
  eventType: NotificationEventType;
  channel: NotificationChannel;
  recipientUserId: number;
  entityType: string;
  entityId: number;
  vars: Record<string, string>;
}

// Single recipient, single channel — used by the per-row SLA reminder
// dispatcher, which needs granular success/failure per ActionItemReminder
// row. Throws TemplateNotFoundError if the (eventType, channel) template is
// missing or deactivated, and a plain Error for any other delivery failure
// (email not configured, no email on file, SMTP failure) — callers that
// track per-row retry state (the SLA dispatcher) distinguish the two.
export async function dispatchTemplatedNotification(input: DispatchTemplatedNotificationInput): Promise<void> {
  const template = await prisma.notificationTemplate.findUnique({
    where: { eventType_channel: { eventType: input.eventType, channel: input.channel } },
  });
  if (!template || !template.isActive) {
    throw new TemplateNotFoundError(`No active ${input.channel} template for ${input.eventType}`);
  }

  if (input.channel === 'IN_APP') {
    await prisma.notification.create({
      data: {
        userId: input.recipientUserId,
        title: template.subject || input.eventType,
        message: renderTemplate(template.body, input.vars),
        type: input.eventType,
        channel: 'IN_APP',
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
    return;
  }

  if (!(await isMailConfigured())) throw new Error('Email is not configured');
  const email = await resolveUserEmail(input.recipientUserId);
  if (!email) throw new Error('recipient has no email on file');

  try {
    await sendMail({
      to: email,
      subject: renderTemplate(template.subject || input.eventType, input.vars),
      html: renderTemplate(template.body, input.vars),
    });
  } catch (error) {
    throw new EmailTransportError(error instanceof Error ? error.message : String(error));
  }
}

export interface NotifyManyViaTemplateInput {
  eventType: NotificationEventType;
  channels: NotificationChannel[];
  entityType: string;
  entityId: number;
  recipientUserIds: number[];
  vars: Record<string, string>;
}

// Best-effort fan-out to many recipients across channels — used by the
// one-off event notifications (MOM_PUBLISHED, MEETING_CANCELLED,
// MEETING_RESCHEDULED), which aren't per-row tracked like SLA reminders.
// Never throws: a notification failure must not fail the action (publish/
// cancel/reschedule) that triggered it.
export async function notifyManyViaTemplate(input: NotifyManyViaTemplateInput): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const recipientUserId of input.recipientUserIds) {
    for (const channel of input.channels) {
      try {
        await dispatchTemplatedNotification({
          eventType: input.eventType,
          channel,
          recipientUserId,
          entityType: input.entityType,
          entityId: input.entityId,
          vars: input.vars,
        });
        sent += 1;
      } catch (error) {
        if (!(error instanceof TemplateNotFoundError)) {
          console.error(`notifyManyViaTemplate: ${input.eventType}/${channel} to user ${recipientUserId} failed:`, error);
        }
        failed += 1;
      }
    }
  }

  return { sent, failed };
}
