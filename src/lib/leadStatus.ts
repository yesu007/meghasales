// Underlying status values (CONFIRMED / DISQUALIFIED) are unchanged from the
// original pipeline — several routes/pages branch on `status === 'CONFIRMED'`
// (e.g. Events/Documents tab unlock in the lead detail page, event creation
// gating) so the enum values stay stable. Only labels/colors/order changed to
// match the requested New → Contacted → Follow-up Scheduled → Qualified →
// Converted → Lost/Dropped pipeline, plus the new FOLLOW_UP_SCHEDULED stage.
export const LEAD_STATUSES = [
  { value: 'NEW', label: 'New', color: 'bg-slate-100 text-slate-700' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-blue-100 text-blue-700' },
  { value: 'FOLLOW_UP_SCHEDULED', label: 'Follow-up Scheduled', color: 'bg-orange-100 text-orange-700' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-purple-100 text-purple-700' },
  { value: 'CONFIRMED', label: 'Converted', color: 'bg-green-100 text-green-700' },
  { value: 'DISQUALIFIED', label: 'Lost / Dropped', color: 'bg-red-100 text-red-700' },
];

// Pipeline rank used to decide whether a follow-up's auto status-suggestion
// should apply. Auto-suggestion only ever moves a lead forward — it never
// downgrades a lead that's already further along (e.g. Qualified/Converted)
// just because a follow-up was logged.
const STATUS_RANK: Record<string, number> = {
  NEW: 0,
  CONTACTED: 1,
  FOLLOW_UP_SCHEDULED: 2,
  QUALIFIED: 3,
  CONFIRMED: 4,
  DISQUALIFIED: 4,
};

export function leadStatusColor(status: string): string {
  return LEAD_STATUSES.find((s) => s.value === status)?.color || 'bg-slate-100 text-slate-700';
}

export function leadStatusLabel(status: string): string {
  return LEAD_STATUSES.find((s) => s.value === status)?.label || status;
}

export function isTerminalLeadStatus(status: string): boolean {
  return status === 'CONFIRMED' || status === 'DISQUALIFIED';
}

// Given the lead's current status and whether the follow-up being logged sets
// a next follow-up date, returns the status the lead should move to — or null
// if no change is warranted (already at/past that stage in the pipeline).
export function suggestStatusAfterFollowUp(currentStatus: string, hasNextFollowUpDate: boolean): string | null {
  const suggested = hasNextFollowUpDate ? 'FOLLOW_UP_SCHEDULED' : 'CONTACTED';
  if ((STATUS_RANK[currentStatus] ?? 0) >= STATUS_RANK[suggested]) return null;
  return suggested;
}
