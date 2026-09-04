// Implementation Stage/Status — the single source of truth, previously
// declared inline in src/app/dashboard/implementations/page.tsx. Extracted
// here (values/labels/colors unchanged) so the Customer main table can
// reuse the exact same structure/values/UI for its own Stage/Status columns
// rather than duplicating them — see that page's own comment.
export const IMPLEMENTATION_STATUSES = [
  { value: 'PLANNING', label: 'Planning', color: 'bg-slate-100 text-slate-700' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'ON_HOLD', label: 'On Hold', color: 'bg-amber-100 text-amber-700' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-700' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-700' },
];

// Stage values used to live here as a hardcoded IMPLEMENTATION_STAGES
// array — they're now admin-editable via the Stage master
// (prisma/schema.prisma's Stage model, src/app/dashboard/stages/page.tsx)
// and consumed live through src/hooks/useStages.ts instead.

export function implementationStatusColor(status: string): string {
  return IMPLEMENTATION_STATUSES.find((s) => s.value === status)?.color || 'bg-slate-100 text-slate-700';
}

export function implementationStatusLabel(status: string): string {
  return IMPLEMENTATION_STATUSES.find((s) => s.value === status)?.label || status;
}
