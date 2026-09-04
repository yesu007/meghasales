'use client';

import { useState, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  InboxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowsUpDownIcon,
  PencilIcon,
  TrashIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { useProjectsForLead } from '@/hooks/useProjectsForLead';
import { formatBusinessVerticals } from '@/lib/businessVerticals';

const IMPL_STATUSES = [
  { value: 'PLANNING', label: 'Planning', color: 'bg-slate-100 text-slate-700' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  { value: 'ON_HOLD', label: 'On Hold', color: 'bg-amber-100 text-amber-700' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-700' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-700' },
];

const STAGES = [
  'Requirements Gathering',
  'System Configuration',
  'Data Migration',
  'Customization',
  'Testing',
  'User Training',
  'Go-Live',
  'Post Go-Live Support',
];

interface Implementation {
  id: number;
  leadId: number;
  sourceType: string;
  projectName: string | null;
  projectId: number | null;
  linkedProjectName: string | null;
  companyName: string;
  contactPerson: string;
  businessVerticals: string | null;
  verticalId: number | null;
  verticalName: string | null;
  headId: number | null;
  headName: string | null;
  projectManagerId: number | null;
  projectManagerName: string | null;
  status: string;
  startDate: string | null;
  targetEndDate: string | null;
  actualEndDate: string | null;
  currentStage: string | null;
  notes: string | null;
  createdAt: string;
}

interface Lead {
  id: number;
  companyName: string;
  contactPerson: string;
  businessVerticals: string | null;
}

interface UserOption {
  id: number;
  fullName: string;
}

async function fetchImplementations(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/implementations?${query}`);
  if (!res.ok) throw new Error('Failed to fetch implementations');
  return res.json();
}

// Reuses the exact same query each existing tab already uses for its own
// listing — /dashboard/leads's excludeDirectCustomers=true, and
// /dashboard/customers's status=CONFIRMED — rather than a new filtering
// rule, so "Lead records" / "Customer records" here means exactly what
// those tabs already mean.
async function fetchLeads(sourceType: 'LEAD' | 'CUSTOMER'): Promise<Lead[]> {
  const query = sourceType === 'CUSTOMER' ? 'status=CONFIRMED' : 'excludeDirectCustomers=true';
  const res = await fetch(`/api/leads?size=100&sortBy=companyName&sortDir=asc&${query}`);
  if (!res.ok) throw new Error(`Failed to fetch ${sourceType === 'CUSTOMER' ? 'customers' : 'leads'}`);
  const data = await res.json();
  return data.content;
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

export default function ImplementationsPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [verticalFilter, setVerticalFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir };
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;
  if (stageFilter) params.currentStage = stageFilter;
  if (managerFilter) params.projectManagerId = managerFilter;
  if (verticalFilter) params.businessVertical = verticalFilter;

  const activeFilters = [statusFilter, stageFilter, managerFilter, verticalFilter].filter(Boolean).length;
  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setStatusFilter(''); setStageFilter(''); setManagerFilter(''); setVerticalFilter(''); setPage(0);
  };

  const { data: verticalOptions = [] } = useQuery<{ id: number; name: string; headId: number | null; headName: string | null }[]>({
    queryKey: ['verticals'],
    queryFn: async () => { const res = await fetch('/api/verticals'); if (!res.ok) throw new Error('Failed to fetch verticals'); return res.json(); },
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['implementations', params],
    queryFn: () => fetchImplementations(params),
    placeholderData: (prev: any) => prev,
  });

  const blankForm = { sourceType: 'LEAD' as 'LEAD' | 'CUSTOMER', leadId: '', verticalId: '', projectName: '', projectId: '', startDate: '', targetEndDate: '', currentStage: '', projectManagerId: '', notes: '' };
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Business Vertical (and its derived Head) are locked once an
  // implementation is created — same as Source Type/Lead/Project — so
  // editing shows the value actually saved at creation time (server-joined,
  // via GET /api/implementations's own verticalName/headName) rather than a
  // live re-lookup, which would show the wrong thing for a since-deactivated
  // or reassigned Vertical. See openEdit below.
  const [editingVerticalInfo, setEditingVerticalInfo] = useState<{ verticalName: string | null; headName: string | null }>({ verticalName: null, headName: null });

  // Keyed on sourceType so switching Lead <-> Customer refetches the
  // corresponding record set (each already cached separately once fetched).
  const { data: leads = [], isError: isLeadsError } = useQuery({
    queryKey: ['leads-for-impl', form.sourceType],
    queryFn: () => fetchLeads(form.sourceType),
  });

  // Project is scoped to whichever Lead/Customer is already selected above
  // (same convention as Quotations' own Project picker — see
  // useProjectsForLead's own comment) rather than driving Source
  // Type/Lead/Customer itself, so a later Project pick can never silently
  // override the Lead/Customer the user already chose per the required
  // Source Type -> Lead/Company -> Vertical -> Head order.
  const { data: leadProjects = [] } = useProjectsForLead(form.leadId);
  const selectedProject = leadProjects.find((p) => String(p.id) === form.projectId);
  // Keeps the legacy free-text projectName column (still used for list
  // search/sort/display) in sync with whichever project is selected.
  useEffect(() => {
    if (selectedProject) setForm((f) => (f.projectName === selectedProject.projectName ? f : { ...f, projectName: selectedProject.projectName }));
  }, [selectedProject]);

  const selectedVertical = verticalOptions.find((v) => String(v.id) === form.verticalId);

  const { data: users = [], isError: isUsersError } = useQuery<UserOption[]>({
    queryKey: ['users-for-impl'],
    queryFn: fetchUsers,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load implementations');
  }, [isError]);

  useEffect(() => {
    if (isLeadsError) toast.error('Failed to load leads');
  }, [isLeadsError]);

  useEffect(() => {
    if (isUsersError) toast.error('Failed to load users');
  }, [isUsersError]);

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankForm); setFormErrors({}); setEditingVerticalInfo({ verticalName: null, headName: null }); };

  const validateForm = (data: typeof form) => {
    const errs: Record<string, string> = {};
    if (!data.leadId) errs.leadId = 'Lead / company is required';
    return errs;
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editingId ? `/api/implementations/${editingId}` : '/api/implementations';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(editingId ? 'Failed to update implementation' : 'Failed to create implementation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['implementations'] });
      toast.success(editingId ? 'Implementation updated!' : 'Implementation project created!');
      closeDrawer();
    },
    onError: () => toast.error(editingId ? 'Failed to update implementation' : 'Failed to create implementation'),
  });

  const openEdit = (impl: Implementation) => {
    setForm({
      sourceType: impl.sourceType === 'CUSTOMER' ? 'CUSTOMER' : 'LEAD',
      leadId: String(impl.leadId),
      verticalId: impl.verticalId ? String(impl.verticalId) : '',
      projectName: impl.projectName || '',
      projectId: impl.projectId ? String(impl.projectId) : '',
      startDate: impl.startDate ? dayjs(impl.startDate).format('YYYY-MM-DD') : '',
      targetEndDate: impl.targetEndDate ? dayjs(impl.targetEndDate).format('YYYY-MM-DD') : '',
      currentStage: impl.currentStage || '',
      projectManagerId: impl.projectManagerId ? String(impl.projectManagerId) : '',
      notes: impl.notes || '',
    });
    setEditingVerticalInfo({ verticalName: impl.verticalName, headName: impl.headName });
    setEditingId(impl.id);
    setDrawerOpen(true);
  };

  const deleteImpl = async (id: number, name: string) => {
    if (!window.confirm(`Delete implementation "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/implementations/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete implementation'); return; }
    queryClient.invalidateQueries({ queryKey: ['implementations'] });
    toast.success('Implementation deleted');
  };

  const updateImpl = async (id: number, patch: Record<string, any>, successMsg: string) => {
    const res = await fetch(`/api/implementations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error('Failed to update implementation');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['implementations'] });
    toast.success(successMsg);
  };

  const updateStatus = (id: number, status: string) => updateImpl(id, { status }, 'Status updated');
  const assignManager = (id: number, projectManagerId: string) => updateImpl(id, { projectManagerId: projectManagerId || null }, 'Project manager updated');
  const updateStage = (id: number, currentStage: string) => updateImpl(id, { currentStage: currentStage || null }, 'Stage updated');
  const updateStartDate = (id: number, startDate: string) => updateImpl(id, { startDate: startDate || null }, 'Start date updated');
  const updateTargetEndDate = (id: number, targetEndDate: string) => updateImpl(id, { targetEndDate: targetEndDate || null }, 'Target end date updated');

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(0);
  };

  const implementations: Implementation[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowsUpDownIcon className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-amber-600" /> : <ChevronDownIcon className="h-3 w-3 text-amber-600" />;
  };

  // Page numbers with ellipsis, e.g. 1 2 3 4 … 10
  const getPageNumbers = (current: number, total: number): (number | 'ellipsis')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
    if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
    return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
  };
  const pageNumbers = getPageNumbers(page, totalPages || 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Implementations</h1>
          <p className="text-slate-500 mt-1">Track project implementations and delivery</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm(blankForm); setDrawerOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by project name, company..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Statuses</option>
            {IMPL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={() => setFiltersOpen(!filtersOpen)} className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium ${activeFilters > 0 ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-300 text-slate-600'}`}>
            <FunnelIcon className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{activeFilters}</span>}
          </button>
          {(searchInput || activeFilters > 0) && <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-red-500">Clear All</button>}
        </div>
        {filtersOpen && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Business Vertical</label>
              <select value={verticalFilter} onChange={(e) => { setVerticalFilter(e.target.value); setPage(0); }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
                <option value="">All</option>
                {verticalOptions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stage</label>
              <select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(0); }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
                <option value="">All</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Project Manager</label>
              <select value={managerFilter} onChange={(e) => { setManagerFilter(e.target.value); setPage(0); }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
                <option value="">All</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
          </div>
        )}
        {activeFilters > 0 && (
          <div className="flex flex-wrap gap-2">
            {statusFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">Status: {IMPL_STATUSES.find(s => s.value === statusFilter)?.label || statusFilter} <button onClick={() => setStatusFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
            {verticalFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">Vertical: {verticalFilter} <button onClick={() => setVerticalFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
            {stageFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Stage: {stageFilter} <button onClick={() => setStageFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
            {managerFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">Manager: {users.find(u => String(u.id) === managerFilter)?.fullName || managerFilter} <button onClick={() => setManagerFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          </div>
        ) : implementations.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No implementations found</p>
            <p className="text-sm text-slate-400 mt-1">Create a project to get started</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('projectName')} className="flex items-center gap-1 font-semibold text-white">
                        Project <SortIcon col="projectName" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-white">Company</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden sm:table-cell">Business Vertical</th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('status')} className="flex items-center gap-1 font-semibold text-white">
                        Status <SortIcon col="status" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Stage</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">
                      <button onClick={() => handleSort('startDate')} className="flex items-center gap-1 font-semibold text-white">
                        Start <SortIcon col="startDate" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">
                      <button onClick={() => handleSort('targetEndDate')} className="flex items-center gap-1 font-semibold text-white">
                        Target End <SortIcon col="targetEndDate" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden xl:table-cell">Manager</th>
                    <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {implementations.map((impl, idx) => (
                    <tr key={impl.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3 font-medium text-slate-800">{impl.projectName || `Project #${impl.id}`}</td>
                      <td className="px-4 py-3 text-slate-600">{impl.companyName}</td>
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{formatBusinessVerticals(impl.businessVerticals) || 'Not assigned'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={impl.status}
                          onChange={(e) => updateStatus(impl.id, e.target.value)}
                          className={`px-2 py-1 rounded text-xs font-medium border-0 ${IMPL_STATUSES.find(s => s.value === impl.status)?.color || 'bg-slate-100 text-slate-700'}`}
                        >
                          {IMPL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <select
                          value={impl.currentStage || ''}
                          onChange={(e) => updateStage(impl.id, e.target.value)}
                          className="px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Select stage</option>
                          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <input
                          type="date"
                          value={impl.startDate ? dayjs(impl.startDate).format('YYYY-MM-DD') : ''}
                          onChange={(e) => updateStartDate(impl.id, e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded text-xs text-slate-700 focus:ring-2 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <input
                          type="date"
                          value={impl.targetEndDate ? dayjs(impl.targetEndDate).format('YYYY-MM-DD') : ''}
                          onChange={(e) => updateTargetEndDate(impl.id, e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded text-xs text-slate-700 focus:ring-2 focus:ring-amber-500"
                        />
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <select
                          value={impl.projectManagerId || ''}
                          onChange={(e) => assignManager(impl.id, e.target.value)}
                          className="px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Unassigned</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(impl)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteImpl(impl.id, impl.projectName || `Project #${impl.id}`)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Rows per page</span>
                <select
                  value={size}
                  onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
                  className="px-2 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500"
                >
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronLeftIcon className="h-4 w-4" /> Previous
                </button>
                {pageNumbers.map((p, i) =>
                  p === 'ellipsis' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === page ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      {p + 1}
                    </button>
                  )
                )}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Next <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Implementation Drawer */}
      <Transition appear show={drawerOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeDrawer}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                <Dialog.Panel className="w-screen max-w-lg">
                  <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                      <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Implementation' : 'New Implementation Project'}</Dialog.Title>
                      <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const errs = validateForm(form);
                        setFormErrors(errs);
                        if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                        saveMutation.mutate(form);
                      }}
                      className="flex-1 px-6 py-4 space-y-4"
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Source Type *</label>
                          <select
                            disabled={!!editingId}
                            title={editingId ? 'Source Type cannot be changed after creation' : undefined}
                            value={form.sourceType}
                            onChange={(e) => {
                              const sourceType = e.target.value === 'CUSTOMER' ? 'CUSTOMER' : 'LEAD';
                              // Clearing leadId (and any Project already
                              // picked, since it's scoped to the old
                              // leadId) on switch — the previously selected
                              // record belongs to the other list.
                              setForm(f => ({ ...f, sourceType, leadId: '', projectId: '', projectName: '' }));
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            <option value="LEAD">Lead</option>
                            <option value="CUSTOMER">Customer</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Lead / Company *</label>
                          <select
                            disabled={!!editingId}
                            title={editingId ? 'Lead cannot be changed after creation' : undefined}
                            value={form.leadId}
                            onChange={(e) => setForm(f => ({ ...f, leadId: e.target.value, projectId: '', projectName: '' }))}
                            className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500 ${formErrors.leadId ? 'border-red-400' : 'border-slate-300'}`}
                          >
                            <option value="">{form.sourceType === 'CUSTOMER' ? 'Select a customer' : 'Select a lead'}</option>
                            {leads.map((lead: Lead) => (
                              <option key={lead.id} value={lead.id}>
                                {lead.companyName} — {lead.contactPerson}
                              </option>
                            ))}
                          </select>
                          {formErrors.leadId && <p className="text-xs text-red-600 mt-1">{formErrors.leadId}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Business Vertical</label>
                            {editingId ? (
                              <p className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-600">
                                {editingVerticalInfo.verticalName || '—'}
                              </p>
                            ) : (
                              // Always the full Vertical Master list, regardless
                              // of the selected Lead/Company — never filtered
                              // or auto-picked from it (see the field's own
                              // requirement: Vertical is a fully independent,
                              // manual selection here).
                              <select
                                value={form.verticalId}
                                onChange={(e) => setForm(f => ({ ...f, verticalId: e.target.value }))}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                              >
                                <option value="">Select vertical</option>
                                {verticalOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                              </select>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Head</label>
                            <p className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-600">
                              {editingId
                                ? editingVerticalInfo.headName || 'No head assigned'
                                : form.verticalId
                                  ? selectedVertical?.headName || 'No head assigned'
                                  : '—'}
                            </p>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                          <select
                            disabled={!form.leadId || !!editingId}
                            title={!form.leadId ? 'Select a Lead / Company first' : editingId ? 'Project cannot be changed after creation' : undefined}
                            value={form.projectId}
                            onChange={(e) => setForm(f => ({ ...f, projectId: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            <option value="">{form.leadId ? 'Select project' : 'Select a Lead / Company first'}</option>
                            {leadProjects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                            <input
                              type="date"
                              value={form.startDate}
                              onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Target End Date</label>
                            <input
                              type="date"
                              value={form.targetEndDate}
                              onChange={(e) => setForm(f => ({ ...f, targetEndDate: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Current Stage</label>
                          <select
                            value={form.currentStage}
                            onChange={(e) => setForm(f => ({ ...f, currentStage: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">Select stage</option>
                            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Project Manager</label>
                          <select
                            value={form.projectManagerId}
                            onChange={(e) => setForm(f => ({ ...f, projectManagerId: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">Unassigned</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.fullName}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                          <textarea
                            rows={3}
                            value={form.notes}
                            onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={closeDrawer} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                          Cancel
                        </button>
                        <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                          {saveMutation.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create Project'}
                        </button>
                      </div>
                    </form>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
