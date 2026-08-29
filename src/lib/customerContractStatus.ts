// Customer NDA/Contract status and type enums — same {value,label,color}
// pattern as src/lib/leadStatus.ts, kept as their own file since this is a
// distinct status system (not the Lead pipeline status), per business
// requirement.
export const CONTRACT_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-slate-100 text-slate-700' },
  { value: 'SENT', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'SIGNED', label: 'Signed', color: 'bg-green-100 text-green-700' },
  { value: 'EXPIRED', label: 'Expired', color: 'bg-orange-100 text-orange-700' },
  { value: 'TERMINATED', label: 'Terminated', color: 'bg-red-100 text-red-700' },
];

export function contractStatusColor(status: string): string {
  return CONTRACT_STATUSES.find((s) => s.value === status)?.color || 'bg-slate-100 text-slate-700';
}

export function contractStatusLabel(status: string): string {
  return CONTRACT_STATUSES.find((s) => s.value === status)?.label || status;
}

export const CONTRACT_TYPES = [
  { value: 'NDA', label: 'NDA' },
  { value: 'MSA', label: 'MSA' },
  { value: 'SOW', label: 'SOW' },
  { value: 'COMMERCIAL_AGREEMENT', label: 'Commercial Agreement' },
  { value: 'OTHER', label: 'Other' },
];

export function contractTypeLabel(type: string): string {
  return CONTRACT_TYPES.find((t) => t.value === type)?.label || type;
}
