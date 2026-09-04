'use client';

import { useState, useRef, useEffect, Fragment, type ComponentType, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon, ChevronDownIcon, ChevronRightIcon, PencilIcon, TrashIcon, ChartBarIcon, EllipsisVerticalIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';
import { usePermissions } from '@/hooks/usePermissions';
import ProjectFormDrawer, { blankProjectForm, type ProjectFormState } from '@/components/projects/ProjectFormDrawer';
import ProjectBudgetPanel from '@/components/projects/ProjectBudgetPanel';
import { invalidateProjectData } from '@/lib/queryInvalidation';

interface RowActionItem {
  key: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  danger?: boolean;
}

// Portal-rendered dropdown — the projects table scrolls horizontally
// (overflow-x-auto), and CSS forces overflow-y to clip too once overflow-x
// is anything but visible, so an absolutely-positioned menu inside the
// table would be cut off. Rendering into document.body at a computed
// fixed position sidesteps that entirely.
function RowActionsMenu({ items }: { items: RowActionItem[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.right - 192 });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button ref={btnRef} onClick={toggle} className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Row actions">
        <EllipsisVerticalIcon className="h-5 w-5" />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: coords.top, left: coords.left }} className="w-48 z-50 rounded-lg bg-white shadow-lg border border-slate-200 py-1">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => { item.onClick(); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 ${item.danger ? 'text-red-600' : 'text-slate-700'}`}
            >
              <item.icon className={`h-4 w-4 ${item.danger ? '' : 'text-slate-400'}`} /> {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

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
  const searchParams = useSearchParams();
  // Landed here from the calculator after saving a new Budget Estimation
  // (?expand=<projectId>, set by QuotationCalculatorForm) — auto-open that
  // project's panel so the estimation is immediately visible.
  const expandParam = searchParams.get('expand');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProjectFormState>(blankProjectForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(expandParam ? parseInt(expandParam) : null);

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects-admin'] }); invalidateProjectData(queryClient); toast.success(editingId ? 'Project updated' : 'Project created'); closeDrawer(); },
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
      invalidateProjectData(queryClient);
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
                          <RowActionsMenu
                            items={[
                              { key: 'analytics', label: 'Budget Estimation', icon: ChartBarIcon, onClick: () => setExpandedId(isExpanded ? null : p.id) },
                              { key: 'edit', label: 'Edit Project', icon: PencilIcon, onClick: () => openEdit(p) },
                              p.isActive
                                ? {
                                    key: 'delete',
                                    label: 'Delete Project',
                                    icon: TrashIcon,
                                    danger: true,
                                    onClick: () => { if (window.confirm(`Delete project "${p.projectName}"?`)) toggleActive.mutate({ id: p.id, isActive: false }); },
                                  }
                                : { key: 'reactivate', label: 'Reactivate Project', icon: ArrowPathIcon, onClick: () => toggleActive.mutate({ id: p.id, isActive: true }) },
                            ]}
                          />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="px-6 border-t border-slate-100">
                            <ProjectBudgetPanel
                              projectId={p.id}
                              newEstimationHref={
                                canManageQuotations && p.isActive
                                  ? `/dashboard/quotations/calculator?projectId=${p.id}&leadId=${p.customerId ?? p.leadId}`
                                  : undefined
                              }
                            />
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
