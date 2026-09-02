'use client';

import { useQuery } from '@tanstack/react-query';

export interface LeadProjectOption {
  id: number;
  projectName: string;
  verticalId: number;
  verticalName: string;
  headId: number | null;
  headName: string | null;
}

async function fetchProjectsForLead(leadId: string): Promise<LeadProjectOption[]> {
  const res = await fetch(`/api/projects?leadId=${leadId}`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

// Projects related to one selected Lead/Customer/Company — a Project is
// "related" two independent ways (see the Project model's own comments):
// as its required Customer (Project.customerId) or its optional originating
// Lead (Project.leadId); GET /api/projects's own leadId filter matches
// either. Shared by every module (Demos, Quotations, Implementations) whose
// Project dropdown must be scoped to whichever Lead/Customer/Company is
// currently selected, so there's exactly one place that data-loading rule
// lives.
export function useProjectsForLead(leadId: string | number | null | undefined) {
  const id = leadId ? String(leadId) : '';
  return useQuery<LeadProjectOption[]>({
    queryKey: ['projects-for-lead', id],
    queryFn: () => fetchProjectsForLead(id),
    enabled: !!id,
  });
}

export interface ProjectSummary {
  id: number;
  projectName: string;
  customerId: number | null;
  customerName: string | null;
  leadId: number | null;
  leadName: string | null;
  verticalId: number;
  verticalName: string;
  headId: number | null;
  headName: string | null;
}

async function fetchAllProjects(): Promise<ProjectSummary[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

// Full active Project list (same GET /api/projects the Project Master admin
// screen itself uses, just without its leadId filter) — for Demo/
// Implementation's Project-first flow, where the Project picked drives
// which Lead/Customer/Vertical/Head auto-populate, rather than the other
// way around (see useProjectsForLead above, still used by Quotations).
export function useAllProjects() {
  return useQuery<ProjectSummary[]>({ queryKey: ['all-projects'], queryFn: fetchAllProjects });
}
