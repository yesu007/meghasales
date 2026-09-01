// Labels/colors/order for the lead pipeline are admin-editable — see the
// LeadStatusOption model in schema.prisma and GET/PATCH
// /api/lead-status-options. This file only keeps the parts of "status" that
// are NOT admin-editable: the underlying pipeline *codes* themselves
// (several routes/pages branch on `status === 'CONFIRMED'` — e.g. the
// Customers list, Events/Documents tab unlock — so those values stay fixed
// in code) and the pure ranking logic that depends on them.

// Curated Tailwind badge presets offered in the Lead Status admin screen —
// a free-text color field would let a typo silently break every status
// badge on the site, so PATCH /api/lead-status-options/[id] validates
// `color` against this same list server-side.
export const STATUS_COLOR_PRESETS = [
  { value: 'bg-slate-100 text-slate-700', label: 'Slate' },
  { value: 'bg-blue-100 text-blue-700', label: 'Blue' },
  { value: 'bg-orange-100 text-orange-700', label: 'Orange' },
  { value: 'bg-purple-100 text-purple-700', label: 'Purple' },
  { value: 'bg-green-100 text-green-700', label: 'Green' },
  { value: 'bg-red-100 text-red-700', label: 'Red' },
  { value: 'bg-amber-100 text-amber-700', label: 'Amber' },
  { value: 'bg-teal-100 text-teal-700', label: 'Teal' },
  { value: 'bg-pink-100 text-pink-700', label: 'Pink' },
  { value: 'bg-indigo-100 text-indigo-700', label: 'Indigo' },
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
