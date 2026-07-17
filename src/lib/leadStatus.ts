export const LEAD_STATUSES = [
  { value: 'NEW', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-amber-100 text-amber-700' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-green-100 text-green-700' },
  { value: 'CONFIRMED', label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'DISQUALIFIED', label: 'Disqualified', color: 'bg-red-100 text-red-700' },
];

export function leadStatusColor(status: string): string {
  return LEAD_STATUSES.find((s) => s.value === status)?.color || 'bg-slate-100 text-slate-700';
}

export function leadStatusLabel(status: string): string {
  return LEAD_STATUSES.find((s) => s.value === status)?.label || status;
}
