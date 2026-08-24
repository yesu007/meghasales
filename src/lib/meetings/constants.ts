export const MEETING_TYPES = ['INTERNAL', 'CLIENT', 'VENDOR', 'REVIEW', 'OTHER'] as const;
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

// Reopening (CLOSED/CANCELLED -> an open status) is a dedicated operation
// with its own permission and its own target-status rule (see
// reopenActionItem in actionItemService.ts) — it deliberately doesn't
// appear here, same reasoning as Meeting's reschedule being a dedicated
// endpoint rather than a generic status edge.
const ACTION_ITEM_STATUS_TRANSITIONS: Record<ActionItemStatus, ActionItemStatus[]> = {
  DRAFT: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PENDING', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  PENDING: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'PENDING', 'CANCELLED'],
  COMPLETED: ['VERIFIED', 'IN_PROGRESS'], // IN_PROGRESS = verifier rejecting the completion claim back for rework
  VERIFIED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

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
