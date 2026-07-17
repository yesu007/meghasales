export const EVENT_TYPES = [
  'MEETING',
  'PHONE_CALL',
  'VIDEO_CALL',
  'CLIENT_VISIT',
  'INTERNAL_DISCUSSION',
  'FOLLOW_UP',
  'REQUIREMENT_GATHERING',
  'DOCUMENT_REVIEW',
  'DEMO',
  'OTHER',
] as const;

export const EVENT_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const;

export interface EventInput {
  title?: string;
  eventType?: string;
  eventDateTime?: string;
  duration?: number | null;
  followUpDate?: string | null;
  status?: string;
}

export function validateEventInput(input: EventInput): string | null {
  if (!input.title?.trim()) return 'Title is required';
  if (!input.eventType || !(EVENT_TYPES as readonly string[]).includes(input.eventType)) {
    return 'A valid event type is required';
  }
  if (!input.eventDateTime || isNaN(new Date(input.eventDateTime).getTime())) {
    return 'A valid event date/time is required';
  }
  if (input.duration != null && (!Number.isFinite(input.duration) || input.duration <= 0)) {
    return 'Duration must be a positive number of minutes';
  }
  if (input.followUpDate && new Date(input.followUpDate) < new Date(input.eventDateTime)) {
    return 'Follow-up date cannot be before the event date';
  }
  if (input.status && !(EVENT_STATUSES as readonly string[]).includes(input.status)) {
    return 'Invalid event status';
  }
  return null;
}

export interface DiscussionInput {
  notes?: string;
}

export function validateDiscussionInput(input: DiscussionInput): string | null {
  if (!input.notes?.trim()) return 'Discussion notes are required';
  return null;
}
