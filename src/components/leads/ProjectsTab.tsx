'use client';

import { useQuery } from '@tanstack/react-query';
import { RectangleStackIcon } from '@heroicons/react/24/outline';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';

interface ProjectRow {
  id: number;
  projectName: string;
  verticalName: string;
  headName: string | null;
  budget: string | null;
  budgetCurrencyCode: string | null;
  isActive: boolean;
  createdAt: string;
}

interface ProjectsTabProps {
  leadId: number;
}

// Reuses the existing Project Master's own API/data — GET /api/projects
// already matches a Lead/Customer id against either Project.customerId or
// Project.leadId (see that route's own comment), which is exactly the
// relationship this tab needs. No separate data source, no duplicate
// Project Master; this is a read-only view scoped to one leadId via the
// same query param every other Project dropdown in the app already uses
// (src/hooks/useProjectsForLead.ts), just consuming the fuller per-project
// fields that endpoint already returns instead of that hook's narrower
// {id, projectName} shape used for &lt;select&gt; options elsewhere.
async function fetchClientProjects(leadId: number): Promise<ProjectRow[]> {
  const res = await fetch(`/api/projects?leadId=${leadId}`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export default function ProjectsTab({ leadId }: ProjectsTabProps) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['lead-projects', leadId],
    queryFn: () => fetchClientProjects(leadId),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800">Client Projects</h2>
      {isLoading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <RectangleStackIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-slate-600 font-medium">No Projects Found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          {projects.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{p.projectName}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {p.verticalName}
                  {p.headName && <> · {p.headName}</>}
                  {p.budget != null && <> · {formatCurrency(p.budget, p.budgetCurrencyCode || 'INR')}</>}
                  {' · '}Created {dayjs(p.createdAt).format('DD MMM YYYY')}
                </p>
              </div>
              <span className={`flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {p.isActive ? 'Active' : 'Deleted'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
