'use client';

import { useQuery } from '@tanstack/react-query';

export interface LeadStatusOption {
  id: number;
  code: string;
  label: string;
  color: string;
  sortOrder: number;
}

async function fetchLeadStatusOptions(): Promise<LeadStatusOption[]> {
  const res = await fetch('/api/lead-status-options');
  if (!res.ok) throw new Error('Failed to fetch lead status options');
  return res.json();
}

// Admin-editable label/color/order for the 6 fixed lead pipeline stages —
// see the LeadStatusOption model in schema.prisma for why the codes
// themselves aren't editable here. Shared across every page that renders a
// status dropdown/badge so they all reflect the same admin-edited
// labels/colors from one query-cached fetch.
export function useLeadStatusOptions() {
  const { data: options = [] } = useQuery({ queryKey: ['lead-status-options'], queryFn: fetchLeadStatusOptions });
  const label = (code: string) => options.find((o) => o.code === code)?.label || code;
  const color = (code: string) => options.find((o) => o.code === code)?.color || 'bg-slate-100 text-slate-700';
  return { options, label, color };
}
