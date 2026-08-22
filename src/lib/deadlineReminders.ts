import dayjs from 'dayjs';
import prisma from '@/lib/prisma';
import { isTerminalLeadStatus } from '@/lib/leadStatus';
import { isMailConfigured, sendMail } from '@/lib/mail';

// Two-stage escalation, mirroring the admin-ticket reminder pattern but
// simplified to a single fixed schedule (no per-entity configurable
// offsets): NOTIFIED fires the first time an item is seen inside the
// "upcoming" window, so people get an early heads-up; EMAILED fires once
// the item is within 24 hours of its due date, per the requirement that
// email is specifically a <24h escalation on top of the in-app notice.
// Both stages are deduped via DeadlineReminderLog so a once-daily cron
// (Vercel Hobby plan caps crons at once/day) plus opportunistic on-demand
// calls from the leads list route never re-send the same escalation.
const NOTIFY_WINDOW_HOURS = 72;
const EMAIL_WINDOW_HOURS = 24;

type EntityType = 'EVENT' | 'LEAD_FOLLOW_UP' | 'EVENT_DISCUSSION';

interface Candidate {
  entityType: EntityType;
  entityId: number;
  dueDate: Date;
  recipientUserId: number;
  title: string;
  detailUrl: string;
}

export interface DispatchResult {
  notified: number;
  emailed: number;
  emailFailed: number;
}

export async function dispatchDeadlineReminders(now: Date = new Date()): Promise<DispatchResult> {
  const candidates = await collectCandidates(now);
  if (candidates.length === 0) return { notified: 0, emailed: 0, emailFailed: 0 };

  const alreadySent = await prisma.deadlineReminderLog.findMany({
    where: { OR: candidates.map((c) => ({ entityType: c.entityType, entityId: c.entityId })) },
    select: { entityType: true, entityId: true, stage: true },
  });
  const sentKey = (entityType: string, entityId: number, stage: string) => `${entityType}:${entityId}:${stage}`;
  const alreadySentSet = new Set(alreadySent.map((r) => sentKey(r.entityType, r.entityId, r.stage)));

  const mailConfigured = await isMailConfigured();

  let notified = 0;
  let emailed = 0;
  let emailFailed = 0;

  for (const candidate of candidates) {
    const hoursRemaining = dayjs(candidate.dueDate).diff(now, 'hour', true);

    if (!alreadySentSet.has(sentKey(candidate.entityType, candidate.entityId, 'NOTIFIED'))) {
      try {
        await prisma.notification.create({
          data: {
            userId: candidate.recipientUserId,
            title: notificationTitle(candidate.entityType),
            message: `${candidate.title} — due ${dayjs(candidate.dueDate).format('DD MMM YYYY, h:mm A')}`,
            type: notificationType(candidate.entityType),
            channel: 'IN_APP',
            entityType: candidate.entityType,
            entityId: candidate.entityId,
          },
        });
        await prisma.deadlineReminderLog.create({
          data: { entityType: candidate.entityType, entityId: candidate.entityId, stage: 'NOTIFIED' },
        });
        notified += 1;
      } catch (error) {
        // Unique-constraint hit means a concurrent call already logged it —
        // anything else is a real failure, worth surfacing in the cron log.
        if (!isDuplicateLogError(error)) console.error(`Deadline notify failed for ${candidate.entityType}:${candidate.entityId}:`, error);
      }
    }

    if (
      hoursRemaining <= EMAIL_WINDOW_HOURS &&
      mailConfigured &&
      !alreadySentSet.has(sentKey(candidate.entityType, candidate.entityId, 'EMAILED'))
    ) {
      try {
        const email = await resolveRecipientEmail(candidate.recipientUserId);
        if (!email) throw new Error('recipient has no email on file');

        await sendMail({
          to: email,
          subject: `${notificationTitle(candidate.entityType)}: ${candidate.title}`,
          html: emailHtml(candidate, now),
        });
        await prisma.deadlineReminderLog.create({
          data: { entityType: candidate.entityType, entityId: candidate.entityId, stage: 'EMAILED' },
        });
        emailed += 1;
      } catch (error) {
        if (!isDuplicateLogError(error)) {
          console.error(`Deadline email failed for ${candidate.entityType}:${candidate.entityId}:`, error);
          emailFailed += 1;
        }
      }
    }
  }

  return { notified, emailed, emailFailed };
}

function isDuplicateLogError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as any).code === 'P2002';
}

function notificationTitle(entityType: EntityType): string {
  switch (entityType) {
    case 'EVENT':
      return 'Event Reminder';
    case 'LEAD_FOLLOW_UP':
      return 'Follow-up Reminder';
    case 'EVENT_DISCUSSION':
      return 'Deadline Reminder';
  }
}

function notificationType(entityType: EntityType): string {
  switch (entityType) {
    case 'EVENT':
      return 'EVENT_REMINDER';
    case 'LEAD_FOLLOW_UP':
      return 'FOLLOW_UP_REMINDER';
    case 'EVENT_DISCUSSION':
      return 'DEADLINE_REMINDER';
  }
}

function emailHtml(candidate: Candidate, now: Date): string {
  const dueText = dayjs(candidate.dueDate).format('DD MMM YYYY, h:mm A');
  const overdue = dayjs(candidate.dueDate).isBefore(now);
  return `
    <p>${overdue ? 'This is now overdue:' : 'This is due within the next 24 hours:'}</p>
    <p><strong>${escapeHtml(candidate.title)}</strong><br/>Due: ${dueText}</p>
    <p><a href="${candidate.detailUrl}">Open in MeghaSales</a></p>
  `;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Employee.email is the address of record per the linking work that ties
// every User to an Employee — falls back to User.email for the rare case
// (pre-existing data, payroll module disabled) where no Employee row
// exists yet.
async function resolveRecipientEmail(userId: number): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, employee: { select: { email: true } } },
  });
  return user?.employee?.email || user?.email || null;
}

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL || '';
  return `${base}${path}`;
}

async function collectCandidates(now: Date): Promise<Candidate[]> {
  const windowEnd = dayjs(now).add(NOTIFY_WINDOW_HOURS, 'hour').toDate();
  const candidates: Candidate[] = [];

  // Events — upcoming meetings/calls/demos on a lead, not yet happened.
  const events = await prisma.event.findMany({
    where: { status: 'SCHEDULED', eventDateTime: { lte: windowEnd }, createdById: { not: null } },
    select: { id: true, title: true, eventDateTime: true, createdById: true, leadId: true },
  });
  for (const e of events) {
    if (!e.createdById) continue;
    candidates.push({
      entityType: 'EVENT',
      entityId: e.id,
      dueDate: e.eventDateTime,
      recipientUserId: e.createdById,
      title: e.title,
      detailUrl: appUrl(`/dashboard/leads/${e.leadId}`),
    });
  }

  // Lead follow-ups — Lead.nextFollowUpDate is the denormalized "when is
  // this lead next due for contact" field, kept in sync whenever a
  // LeadFollowUp is logged.
  const leads = await prisma.lead.findMany({
    where: { nextFollowUpDate: { lte: windowEnd, not: null }, assignedBaId: { not: null } },
    select: { id: true, companyName: true, nextFollowUpDate: true, assignedBaId: true, status: true },
  });
  for (const l of leads) {
    if (!l.assignedBaId || !l.nextFollowUpDate || isTerminalLeadStatus(l.status)) continue;
    candidates.push({
      entityType: 'LEAD_FOLLOW_UP',
      entityId: l.id,
      dueDate: l.nextFollowUpDate,
      recipientUserId: l.assignedBaId,
      title: `Follow up with ${l.companyName}`,
      detailUrl: appUrl(`/dashboard/leads/${l.id}`),
    });
  }

  // Event-discussion action items — targetDate is the deadline for an
  // action item raised during a discussion, assigned to a specific user.
  const discussions = await prisma.eventDiscussion.findMany({
    where: { completionStatus: { not: 'COMPLETED' }, targetDate: { lte: windowEnd, not: null }, assignedToId: { not: null } },
    select: { id: true, actionItems: true, targetDate: true, assignedToId: true, event: { select: { leadId: true, title: true } } },
  });
  for (const d of discussions) {
    if (!d.assignedToId || !d.targetDate) continue;
    candidates.push({
      entityType: 'EVENT_DISCUSSION',
      entityId: d.id,
      dueDate: d.targetDate,
      recipientUserId: d.assignedToId,
      title: d.actionItems?.slice(0, 120) || `Action item from ${d.event.title}`,
      detailUrl: appUrl(`/dashboard/leads/${d.event.leadId}`),
    });
  }

  return candidates;
}
