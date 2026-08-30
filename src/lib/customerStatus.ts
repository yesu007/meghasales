// Lifecycle status for a converted customer (Lead.status === 'CONFIRMED') —
// independent of the lead pipeline status in src/lib/leadStatus.ts. See the
// customerStatus field comment on the Lead model for why this is a separate
// field rather than reusing `status`.
export const CUSTOMER_STATUSES = [
  { value: 'ACTIVE', label: 'Active', color: 'bg-green-100 text-green-700' },
  { value: 'INACTIVE', label: 'Inactive', color: 'bg-slate-200 text-slate-600' },
  { value: 'ON_HOLD', label: 'On Hold', color: 'bg-amber-100 text-amber-700' },
];

export function customerStatusColor(status: string): string {
  return CUSTOMER_STATUSES.find((s) => s.value === status)?.color || 'bg-slate-100 text-slate-700';
}

export function customerStatusLabel(status: string): string {
  return CUSTOMER_STATUSES.find((s) => s.value === status)?.label || status;
}
