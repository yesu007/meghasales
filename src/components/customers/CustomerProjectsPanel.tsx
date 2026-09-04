'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useStages } from '@/hooks/useStages';
import { IMPLEMENTATION_STATUSES } from '@/lib/implementationStatus';
import { invalidateImplementationData, invalidateProjectData } from '@/lib/queryInvalidation';

interface CustomerProjectRow {
  id: number;
  projectName: string;
  verticalName: string;
  // This Project's most-recently-created Implementation (see GET
  // /api/projects's includeImplementation param) — null if it has none yet.
  // Status/Stage below read and write through it, not through Project
  // itself, which has neither field (see the Project model's own comment).
  implementation: { id: number; status: string; currentStage: string | null } | null;
}

async function fetchCustomerProjects(customerId: number): Promise<CustomerProjectRow[]> {
  const res = await fetch(`/api/projects?leadId=${customerId}&includeImplementation=true`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

// Expanded panel for a Customer row in the main Customer table — same
// Fragment + conditional-row accordion pattern as the Project module's own
// (src/app/dashboard/projects/page.tsx's ProjectBudgetPanel), just showing
// every Project Master row linked to this Customer (Project.customerId)
// instead of Budget Estimations. Each Project's Status/Stage dropdown
// reuses the exact values/styling/update endpoint as the Customer table's
// own top-level Stage/Status columns and the Implementations module
// (src/app/dashboard/implementations/page.tsx's updateStatus/updateStage) —
// just scoped to one Project's Implementation instead of the Customer's
// most-recent one.
//
// `enabled` (default true) gates the fetch — the parent row now always
// mounts this component so its expand/collapse can animate smoothly (see
// customers/page.tsx's grid-template-rows transition), but passes
// enabled={isExpanded} so the query still only fires once actually
// expanded, same lazy-fetch behavior as before.
export default function CustomerProjectsPanel({ customerId, enabled = true }: { customerId: number; enabled?: boolean }) {
  const queryClient = useQueryClient();
  const stages = useStages();
  const queryKey = ['customer-projects', customerId];
  const { data: projects = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchCustomerProjects(customerId),
    enabled,
  });

  const updateImplementation = async (implementationId: number, patch: Record<string, any>, successMsg: string) => {
    const res = await fetch(`/api/implementations/${implementationId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { toast.error('Failed to update implementation'); return; }
    queryClient.invalidateQueries({ queryKey });
    invalidateImplementationData(queryClient);
    invalidateProjectData(queryClient);
    toast.success(successMsg);
  };

  // A Project with no Implementation row yet has nothing to PUT against —
  // silently create one first (same on-demand-create convention as the
  // Customer table's own ensureImplementationThenUpdate), then apply the
  // just-picked value, so the dropdown always saves correctly either way.
  const ensureImplementationThenUpdate = async (project: CustomerProjectRow, patch: Record<string, any>, successMsg: string) => {
    let implementationId = project.implementation?.id;
    if (!implementationId) {
      const res = await fetch('/api/implementations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: customerId, sourceType: 'CUSTOMER', projectId: project.id }),
      });
      if (!res.ok) { toast.error('Failed to create implementation'); return; }
      implementationId = (await res.json()).id;
    }
    await updateImplementation(implementationId!, patch, successMsg);
  };

  const updateStatus = (project: CustomerProjectRow, status: string) => ensureImplementationThenUpdate(project, { status }, 'Status updated');
  const updateStage = (project: CustomerProjectRow, currentStage: string) => ensureImplementationThenUpdate(project, { currentStage: currentStage || null }, 'Stage updated');

  return (
    <div className="my-4 bg-white rounded-lg border border-amber-200/70 shadow-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <FolderIcon className="h-4 w-4 text-slate-400" />
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Projects{!isLoading && projects.length > 0 && ` · ${projects.length}`}
        </p>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-sm text-slate-400">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">No projects found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2">Project Name</th>
                <th className="px-4 py-2">Vertical</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((project) => {
                const status = project.implementation?.status || 'PLANNING';
                return (
                  <tr key={project.id} className="hover:bg-amber-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{project.projectName}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                        {project.verticalName || 'Not assigned'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={status}
                        onChange={(e) => updateStatus(project, e.target.value)}
                        className={`px-2 py-1 rounded text-xs font-medium border-0 ${IMPLEMENTATION_STATUSES.find(s => s.value === status)?.color || 'bg-slate-100 text-slate-700'}`}
                      >
                        {IMPLEMENTATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        value={project.implementation?.currentStage || ''}
                        onChange={(e) => updateStage(project, e.target.value)}
                        className="px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Select stage</option>
                        {stages.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
