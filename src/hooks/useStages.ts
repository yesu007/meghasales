'use client';

import { useQuery } from '@tanstack/react-query';

export interface StageOption {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
}

async function fetchStages(): Promise<StageOption[]> {
  const res = await fetch('/api/stages');
  if (!res.ok) throw new Error('Failed to fetch stages');
  return res.json();
}

// Admin-editable Stage picklist — see the Stage model in schema.prisma.
// Unlike useLeadSources, `name` (not `code`) is what Implementation.
// currentStage actually stores (see the Stage model's own comment), so
// dropdowns built from this should use
// `<option value={s.name}>{s.name}</option>` to stay compatible with
// existing Implementation rows.
export function useStages() {
  const { data: stages = [] } = useQuery({ queryKey: ['stages'], queryFn: fetchStages });
  return stages;
}
