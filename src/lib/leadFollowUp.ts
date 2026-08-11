import { isTerminalLeadStatus } from '@/lib/leadStatus';

export const FOLLOWUP_METHODS = [
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'VISIT', label: 'Visit' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'OTHER', label: 'Other' },
];

export const FOLLOWUP_OUTCOMES = [
  { value: 'INTERESTED', label: 'Interested' },
  { value: 'CALLBACK_REQUESTED', label: 'Callback Requested' },
  { value: 'NEEDS_MORE_INFO', label: 'Needs More Info' },
  { value: 'NOT_REACHED', label: 'Not Reached' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'CONVERTED', label: 'Converted' },
];

export function followUpMethodLabel(method: string): string {
  return FOLLOWUP_METHODS.find((m) => m.value === method)?.label || method;
}

export function followUpOutcomeLabel(outcome: string | null): string {
  if (!outcome) return '—';
  return FOLLOWUP_OUTCOMES.find((o) => o.value === outcome)?.label || outcome;
}

export function validateFollowUpInput(body: { followUpDate?: string; method?: string; nextFollowUpDate?: string | null }): string | null {
  if (!body.followUpDate) return 'Follow-up date is required';
  if (!body.method) return 'Method is required';
  if (!FOLLOWUP_METHODS.some((m) => m.value === body.method)) return 'Invalid follow-up method';
  if (body.nextFollowUpDate && new Date(body.nextFollowUpDate) < new Date(body.followUpDate)) {
    return 'Next follow-up date cannot be before the follow-up date';
  }
  return null;
}

// A lead is overdue when it has a next follow-up date in the past and hasn't
// reached a terminal outcome (Converted/Lost) yet.
export function isFollowUpOverdue(nextFollowUpDate: Date | string | null, status: string, now: Date = new Date()): boolean {
  if (!nextFollowUpDate) return false;
  if (isTerminalLeadStatus(status)) return false;
  return new Date(nextFollowUpDate) < now;
}
