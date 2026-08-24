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
