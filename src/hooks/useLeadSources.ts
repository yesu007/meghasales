'use client';

import { useQuery } from '@tanstack/react-query';

export interface LeadSourceOption {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
}

async function fetchLeadSources(): Promise<LeadSourceOption[]> {
  const res = await fetch('/api/lead-sources');
  if (!res.ok) throw new Error('Failed to fetch lead sources');
  return res.json();
}

// Admin-editable Lead Source picklist — see the LeadSource model in
// schema.prisma. `code` is what Lead.leadSource actually stores, so
// dropdowns built from this should use `<option value={s.code}>{s.name}</option>`
// to stay compatible with existing Lead rows and the leadSource filter.
export function useLeadSources() {
  const { data: sources = [] } = useQuery({ queryKey: ['lead-sources'], queryFn: fetchLeadSources });
  return sources;
}
