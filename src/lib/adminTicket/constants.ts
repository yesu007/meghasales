export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING', 'COMPLETED', 'CANCELLED'] as const;
export type TicketStatus = (typeof STATUSES)[number];

// Anything not listed here is rejected — COMPLETED/CANCELLED are terminal.
const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'PENDING', 'CANCELLED'],
  IN_PROGRESS: ['PENDING', 'COMPLETED', 'CANCELLED'],
  PENDING: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidStatusTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM_CRON'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const REMINDER_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'PUSH'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export const RECIPIENT_TYPES = ['ASSIGNEE', 'CREATOR', 'ROLE', 'EXPLICIT'] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export const REMINDER_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED'] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const MAX_REMINDER_ATTEMPTS = 3;

// Materialized against a ticket's due date whenever it's set — negative
// offsets are advance warnings, positive ones are overdue escalations sent
// to the category's escalation role rather than the assignee. Deliberately
// short (3 reminders) to avoid the notification-fatigue failure mode noted
// in the module's design doc; only IN_APP is wired to an actual sender
// today (see dispatcher.ts), so that's the only channel materialized here.
export const DEFAULT_REMINDER_OFFSETS: Array<{ offsetDays: number; recipientType: RecipientType }> = [
  { offsetDays: -7, recipientType: 'ASSIGNEE' },
  { offsetDays: -1, recipientType: 'ASSIGNEE' },
  { offsetDays: 3, recipientType: 'ROLE' },
];
