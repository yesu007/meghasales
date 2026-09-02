'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronDownIcon, ChevronRightIcon, PencilIcon, TrashIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';
import { usePermissions } from '@/hooks/usePermissions';
import ProjectFormDrawer, { blankProjectForm, type ProjectFormState } from '@/components/projects/ProjectFormDrawer';
import ProjectBudgetPanel from '@/components/projects/ProjectBudgetPanel';

interface ProjectRow {
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
  budget: string | null;
  budgetCurrencyCode: string | null;
  isActive: boolean;
}

async function fetchProjects(): Promise<ProjectRow[]> {
  const res = await fetch('/api/projects?includeInactive=true');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canManageQuotations = has('manage_quotations');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectFormState>(blankProjectForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: projects = [], isLoading, isError } = useQuery({ queryKey: ['projects-admin'], queryFn: fetchProjects });

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankProjectForm); setFormErrors({}); };

  const openEdit = (p: ProjectRow) => {
    setEditingId(p.id);
    setForm({
      projectName: p.projectName,
      customerId: p.customerId ? String(p.customerId) : '',
      leadId: p.leadId ? String(p.leadId) : '',
      verticalId: String(p.verticalId),
      headId: p.headId ? String(p.headId) : '',
      budget: p.budget || '',
    });
    setDrawerOpen(true);
  };

  const save = useMutation({
    mutationFn: async (data: ProjectFormState) => {
      const url = editingId ? `/api/projects/${editingId}` : '/api/projects';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          customerId: data.customerId || null,
          leadId: data.leadId || null,
          headId: data.headId || null,
          budget: data.budget || null,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save project'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects-admin'] }); toast.success(editingId ? 'Project updated' : 'Project created'); closeDrawer(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = isActive
        ? await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) })
        : await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update project'); }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projects-admin'] });
      toast.success(variables.isActive ? 'Project reactivated' : 'Project deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Projects</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Customer engagements grouped by vertical, with a responsible head and budget</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm(blankProjectForm); setDrawerOpen(true); }}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> Add Project
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : isError ? (
          <p className="text-center py-16 text-red-500">Failed to load projects. Please try refreshing the page.</p>
        ) : projects.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No projects created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-2 py-3"></th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Project Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Lead</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Vertical</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Head</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Budget</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p, idx) => {
                  const budgetCurrency = p.budgetCurrencyCode || 'INR';
                  const budgetNum = p.budget != null ? Number(p.budget) : null;
                  const isExpanded = expandedId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                        <td className="px-2 py-3">
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : p.id)}
                            className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                            title={isExpanded ? 'Hide Budget Estimations' : 'Show Budget Estimations'}
                          >
                            {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{p.projectName}</td>
                        <td className="px-4 py-3 text-slate-600">{p.customerName || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{p.leadName || '—'}</td>
                        <td className="px-4 py-3 text-slate-600">{p.verticalName}</td>
                        <td className="px-4 py-3 text-slate-600">{p.headName || '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-700">{budgetNum != null ? formatCurrency(budgetNum, budgetCurrency) : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {p.isActive ? 'Active' : 'Deleted'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {canManageQuotations && p.isActive && (
                              <Link
                                href={`/dashboard/quotations/calculator?projectId=${p.id}&leadId=${p.customerId ?? p.leadId}`}
                                title="New Budget Estimation (Resource-Based Quotation) for this project"
                                className="p-1.5 rounded text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                              >
                                <ChartBarIcon className="h-4 w-4" />
                              </Link>
                            )}
                            <button onClick={() => openEdit(p)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            {p.isActive ? (
                              <button
                                onClick={() => { if (window.confirm(`Delete project "${p.projectName}"?`)) toggleActive.mutate({ id: p.id, isActive: false }); }}
                                className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Delete"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            ) : (
                              <button onClick={() => toggleActive.mutate({ id: p.id, isActive: true })} className="text-xs font-medium text-green-700 hover:text-green-800">
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="px-6 border-t border-slate-100">
                            <ProjectBudgetPanel projectId={p.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ProjectFormDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        editingId={editingId}
        form={form}
        setForm={setForm}
        formErrors={formErrors}
        setFormErrors={setFormErrors}
        onSave={(data) => save.mutate(data)}
        isSaving={save.isPending}
      />
    </div>
  );
}
