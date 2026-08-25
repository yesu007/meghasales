export const MEETING_TYPES = ['INTERNAL', 'CLIENT', 'VENDOR', 'REVIEW', 'OTHER', 'TO_DO'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MEETING_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type MeetingPriority = (typeof MEETING_PRIORITIES)[number];

export const MEETING_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

// Rescheduling changes `scheduledAt` and logs a RESCHEDULED activity — it is
// not a status of its own; a rescheduled meeting is still SCHEDULED, just
// for a new time. COMPLETED/CANCELLED are terminal in normal use, but still
// reachable from each other in case of a mistaken transition — same "every
// status can move to every other status" reasoning as AdminTicket's
// STATUS_TRANSITIONS.
const STATUS_TRANSITIONS: Record<MeetingStatus, MeetingStatus[]> = {
  SCHEDULED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['SCHEDULED', 'CANCELLED'],
  CANCELLED: ['SCHEDULED'],
};

export function isValidMeetingStatusTransition(from: MeetingStatus, to: MeetingStatus): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const PARTICIPANT_TYPES = ['INTERNAL', 'EXTERNAL'] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const PARTICIPANT_ROLES = ['ORGANIZER', 'ATTENDEE', 'OPTIONAL'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const RSVP_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE'] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const AGENDA_ITEM_STATUSES = ['PENDING', 'DISCUSSED', 'DEFERRED'] as const;
export type AgendaItemStatus = (typeof AGENDA_ITEM_STATUSES)[number];

// REF_TYPES this module's Meeting.refType is validated against — mirrors
// AdminTicket's loose refType/refId convention. Extend this list rather
// than adding a dedicated nullable FK column when a new relation appears.
export const MEETING_REF_TYPES = ['LEAD', 'IMPLEMENTATION', 'ADMIN_TICKET'] as const;
export type MeetingRefType = (typeof MEETING_REF_TYPES)[number];

export const MOM_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PUBLISHED'] as const;
export type MomStatus = (typeof MOM_STATUSES)[number];

// Content (summary/risksIssues/decisions) can only be edited while the MOM
// hasn't left the authoring stage or has bounced back from a rejection —
// once SUBMITTED/APPROVED/PUBLISHED, editing would silently invalidate an
// approval someone already gave. Reopening for edits is done by rejecting
// it back to DRAFT (via REJECTED), not by allowing arbitrary edits later.
export function isMomContentEditable(status: MomStatus): boolean {
  return status === 'DRAFT' || status === 'REJECTED';
}

const MOM_STATUS_TRANSITIONS: Record<MomStatus, MomStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED', 'REJECTED'],
  REJECTED: ['SUBMITTED'],
  PUBLISHED: [],
};

export function isValidMomStatusTransition(from: MomStatus, to: MomStatus): boolean {
  if (from === to) return false;
  return MOM_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ACTION_ITEM_STATUSES = [
  'DRAFT',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'PENDING',
  'BLOCKED',
  'COMPLETED',
  'VERIFIED',
  'CLOSED',
  'CANCELLED',
] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const ACTION_ITEM_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ActionItemPriority = (typeof ACTION_ITEM_PRIORITIES)[number];

// Every open status can move directly to every other open status, or be
// closed/cancelled outright — same "every status can move to every other"
// flexibility as AdminTicket's STATUS_TRANSITIONS, so fixing a mistaken
// status doesn't mean walking back through each intermediate step.
//
// CLOSED and CANCELLED are the two exceptions, and stay terminal here on
// purpose: reopening one has to clear completedAt/verifiedAt/
// closureRemarks, which only reopenActionItem() does correctly, so
// reopening is a dedicated operation with its own permission
// (reopen_action_items) rather than a generic status edge — same
// reasoning as Meeting's reschedule being a dedicated endpoint instead of
// a generic status edge.
// Exported for reuse by the Phase 5 dashboard/report services, which need
// the same "still in the pipeline" definition as the transition graph below.
export const ACTION_ITEM_OPEN_STATUSES: ActionItemStatus[] = ['DRAFT', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'PENDING', 'BLOCKED', 'COMPLETED', 'VERIFIED'];

const ACTION_ITEM_STATUS_TRANSITIONS: Record<ActionItemStatus, ActionItemStatus[]> = ACTION_ITEM_STATUSES.reduce(
  (acc, status) => {
    acc[status] = ACTION_ITEM_OPEN_STATUSES.includes(status)
      ? [...ACTION_ITEM_OPEN_STATUSES.filter((s) => s !== status), 'CLOSED', 'CANCELLED']
      : [];
    return acc;
  },
  {} as Record<ActionItemStatus, ActionItemStatus[]>
);

export function isValidActionItemStatusTransition(from: ActionItemStatus, to: ActionItemStatus): boolean {
  if (from === to) return false;
  return ACTION_ITEM_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export type ActionItemTransitionCapability = 'ASSIGN' | 'OWNER' | 'VERIFY' | 'CLOSE' | 'CANCEL';

// Which capability a transition requires — checked by the route/service
// layer alongside isValidActionItemStatusTransition. Order matters: the
// COMPLETED->IN_PROGRESS "reject a completion claim" edge must be caught
// before the generic "moving into IN_PROGRESS is an OWNER action" rule
// below it, since the same target status means something different
// depending on where it came from.
export function getActionItemTransitionCapability(from: ActionItemStatus, to: ActionItemStatus): ActionItemTransitionCapability | null {
  if (from === 'COMPLETED' && to === 'IN_PROGRESS') return 'VERIFY';
  if (to === 'CANCELLED') return 'CANCEL';
  if (to === 'ASSIGNED') return 'ASSIGN';
  if (to === 'VERIFIED') return 'VERIFY';
  if (to === 'CLOSED') return 'CLOSE';
  if (to === 'ACCEPTED' || to === 'IN_PROGRESS' || to === 'PENDING' || to === 'BLOCKED' || to === 'COMPLETED') return 'OWNER';
  return null;
}

export const FOLLOWUP_FREQUENCIES = ['ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type FollowUpFrequency = (typeof FOLLOWUP_FREQUENCIES)[number];

export const FOLLOWUP_STATUSES = ['PENDING', 'COMPLETED'] as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

// ============================================================
// SLA ENGINE + NOTIFICATION TEMPLATES (Phase 4)
// ============================================================

export const NOTIFICATION_EVENT_TYPES = [
  'ACTION_ITEM_DUE_SOON',
  'ACTION_ITEM_OVERDUE',
  'ACTION_ITEM_ESCALATED',
  'MOM_PUBLISHED',
  'MEETING_CANCELLED',
  'MEETING_RESCHEDULED',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const REMINDER_RECIPIENT_TYPES = ['ASSIGNEE', 'ORGANIZER'] as const;
export type ReminderRecipientType = (typeof REMINDER_RECIPIENT_TYPES)[number];

export const MAX_REMINDER_ATTEMPTS = 3;

// Sane starting defaults, not fixed policy — editable later the same way
// AdminTicket's DEFAULT_REMINDER_OFFSETS would be. Tighter cadence and an
// earlier hand-off to the meeting organizer as priority rises.
export const SLA_OFFSETS_BY_PRIORITY: Record<ActionItemPriority, Array<{ offsetDays: number; recipientType: ReminderRecipientType }>> = {
  LOW: [
    { offsetDays: -2, recipientType: 'ASSIGNEE' },
    { offsetDays: 3, recipientType: 'ASSIGNEE' },
    { offsetDays: 7, recipientType: 'ORGANIZER' },
  ],
  MEDIUM: [
    { offsetDays: -1, recipientType: 'ASSIGNEE' },
    { offsetDays: 2, recipientType: 'ASSIGNEE' },
    { offsetDays: 4, recipientType: 'ORGANIZER' },
  ],
  HIGH: [
    { offsetDays: -1, recipientType: 'ASSIGNEE' },
    { offsetDays: 1, recipientType: 'ASSIGNEE' },
    { offsetDays: 2, recipientType: 'ORGANIZER' },
  ],
  CRITICAL: [
    { offsetDays: 0, recipientType: 'ASSIGNEE' },
    { offsetDays: 1, recipientType: 'ORGANIZER' },
    { offsetDays: 2, recipientType: 'ORGANIZER' },
  ],
};

// ============================================================
// DASHBOARDS & REPORTING (Phase 5)
// ============================================================

// Shared with the reminder dispatcher: an item in one of these statuses no
// longer needs a due-date-driven urgency signal, whether or not it has been
// formally verified/closed.
export const ACTION_ITEM_RESOLVED_STATUSES: ActionItemStatus[] = ['COMPLETED', 'VERIFIED', 'CLOSED', 'CANCELLED'];

export const ACTION_ITEM_SLA_STATUSES = ['ON_TRACK', 'DUE_SOON', 'OVERDUE', 'ON_TIME', 'BREACHED', 'NOT_APPLICABLE'] as const;
export type ActionItemSlaStatus = (typeof ACTION_ITEM_SLA_STATUSES)[number];

const DUE_SOON_WINDOW_DAYS = 2;

// Computed on read, not stored — Phase 4 shipped a reminder-offset SLA
// model (per-priority scheduled nudges), not the tiered sla_configs/
// sla_transactions engine with pause/resume the design doc originally
// specced, so there is no persisted breach log to read "SLA status" from.
// ON_TIME/BREACHED apply once resolved (was resolution before or after the
// due date); DUE_SOON/OVERDUE/ON_TRACK apply while still open; a CANCELLED
// item never had an SLA outcome, so it's NOT_APPLICABLE rather than
// counted as either a pass or a breach.
export function classifyActionItemSlaStatus(
  item: { status: string; dueDate: Date; completedAt: Date | null },
  now: Date = new Date()
): ActionItemSlaStatus {
  if (item.status === 'CANCELLED') return 'NOT_APPLICABLE';
  if ((ACTION_ITEM_RESOLVED_STATUSES as string[]).includes(item.status)) {
    const resolvedAt = item.completedAt ?? now;
    return resolvedAt.getTime() > item.dueDate.getTime() ? 'BREACHED' : 'ON_TIME';
  }
  if (item.dueDate.getTime() < now.getTime()) return 'OVERDUE';
  const daysToDue = (item.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysToDue <= DUE_SOON_WINDOW_DAYS ? 'DUE_SOON' : 'ON_TRACK';
}
