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
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { useProjectsForLead } from '@/hooks/useProjectsForLead';
import { useProductsForLead } from '@/hooks/useProductsForLead';
// IMPL_STATUSES/STAGES moved to this shared lib (values/labels/colors
// unchanged) so the Customer main table can reuse the exact same
// structure — see src/lib/implementationStatus.ts's own comment. STAGES
// itself now comes live from the Stage master via useStages() below (see
// its own comment), not a hardcoded list.
import { IMPLEMENTATION_STATUSES as IMPL_STATUSES } from '@/lib/implementationStatus';
import { useStages } from '@/hooks/useStages';
import { invalidateImplementationData } from '@/lib/queryInvalidation';
import AddableSelect from '@/components/AddableSelect';
// Go Live / Post Go Live tab labels + the state type — the tabs' own stage
// categorization (GO_LIVE_STAGES/POST_GO_LIVE_STAGES) is applied server-side
// in /api/implementations, not here.
import { IMPLEMENTATION_STAGE_TABS, type ImplementationStageCategory } from '@/lib/implementationStages';

interface Implementation {
  id: number;
  leadId: number;
  sourceType: string;
  projectName: string | null;
  projectId: number | null;
  linkedProjectName: string | null;
  productId: number | null;
  linkedProductName: string | null;
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
  // Stage master (src/app/dashboard/stages/page.tsx) replaces the old
  // hardcoded IMPLEMENTATION_STAGES array — flattened to plain names here
  // so every existing STAGES.map(...) render below is unchanged.
  const STAGES = useStages().map(s => s.name);

  // Top-level Go Live / Post Go Live tabs, same role as the Leads module's
  // own view tabs — opens on Go Live by default (per the module's spec).
  const [stageCategory, setStageCategory] = useState<ImplementationStageCategory>('GO_LIVE');
  const changeStageCategory = (cat: ImplementationStageCategory) => { setStageCategory(cat); setPage(0); };

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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

  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir, stageCategory };
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

  const blankForm = { sourceType: 'LEAD' as 'LEAD' | 'CUSTOMER', leadId: '', verticalId: '', projectName: '', projectId: '', productId: '', startDate: '', targetEndDate: '', currentStage: '', projectManagerId: '', notes: '' };
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // Clears one field's stale "required" message as soon as the user
  // actually changes it — validateForm only runs again on the next submit,
  // so without this a message set by a failed submit attempt would
  // otherwise keep showing even after the field now holds a valid value.
  const clearFieldError = (key: string) => setFormErrors((fe) => (key in fe ? Object.fromEntries(Object.entries(fe).filter(([k]) => k !== key)) : fe));
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

  // Project and Product are both scoped to whichever Lead/Customer is
  // already selected above (same convention as Quotations' own pickers —
  // see useProjectsForLead/useProductsForLead's own comments) rather than
  // driving Source Type/Lead/Customer itself, so a later pick can never
  // silently override the Lead/Customer the user already chose, per the
  // required Source Type -> Lead/Company -> Project/Product order.
  const { data: leadProjects = [] } = useProjectsForLead(form.leadId);
  const { data: leadProducts = [] } = useProductsForLead(form.leadId);
  const selectedProject = leadProjects.find((p) => String(p.id) === form.projectId);
  const selectedProduct = leadProducts.find((p) => String(p.id) === form.productId);
  // Keeps the legacy free-text projectName column (still used for list
  // search/sort/display) in sync with whichever project is selected.
  useEffect(() => {
    if (selectedProject) setForm((f) => (f.projectName === selectedProject.projectName ? f : { ...f, projectName: selectedProject.projectName }));
  }, [selectedProject]);

  // Business Vertical (and the Head derived from it) are now auto-populated
  // from whichever of Project/Product is selected — each already carries
  // exactly one Vertical (LeadProjectOption/LeadProductOption's own
  // verticalId/verticalName/headId/headName), so this reuses that existing
  // data rather than a new lookup, same pattern as the Quotation
  // Calculator's own "auto-fill Vertical from the selected Project" effect.
  // The user never picks Vertical/Head manually here — see their own
  // read-only display below. Project and Product are mutually exclusive
  // (see their own disabled fields), so at most one of the two is ever set;
  // selectedProject wins if somehow both were (shouldn't happen). Skipped
  // once editing (editingId set): Source Type/Lead/Project/Product are all
  // locked then, and the Vertical/Head actually saved at creation time —
  // server-joined via editingVerticalInfo, same "don't silently show a
  // since-changed value" reasoning as that state's own comment — must keep
  // showing regardless of whether the linked Project/Product's own Vertical
  // has since changed.
  useEffect(() => {
    if (editingId) return;
    const source = selectedProject || selectedProduct;
    const nextVerticalId = source ? String(source.verticalId) : '';
    setForm((f) => (f.verticalId === nextVerticalId ? f : { ...f, verticalId: nextVerticalId }));
  }, [selectedProject, selectedProduct, editingId]);

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
    // Project and Product are mutually exclusive (see their own disabled
    // fields below), but at least one is required — same rule as the
    // Quotation module's own Project/Product validation. Only checked on
    // create: both are locked once editingId is set, so a legacy record
    // with neither could never be saved again if this also applied there.
    if (!editingId && !data.projectId && !data.productId) errs.project = 'Select a Project or Product';
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
      invalidateImplementationData(queryClient);
      toast.success(editingId ? 'Implementation updated!' : 'Implementation project created!');
      closeDrawer();
    },
    onError: () => toast.error(editingId ? 'Failed to update implementation' : 'Failed to create implementation'),
  });

  const openEdit = (impl: Implementation) => {
    // Guards against a still-open drawer's stale validation messages from a
    // previous failed create attempt bleeding into this edit (see
    // clearFieldError's own comment) — closeDrawer already clears this on
    // the normal Cancel/X path, this is just defense in depth.
    setFormErrors({});
    setForm({
      sourceType: impl.sourceType === 'CUSTOMER' ? 'CUSTOMER' : 'LEAD',
      leadId: String(impl.leadId),
      verticalId: impl.verticalId ? String(impl.verticalId) : '',
      projectName: impl.projectName || '',
      projectId: impl.projectId ? String(impl.projectId) : '',
      productId: impl.productId ? String(impl.productId) : '',
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
    invalidateImplementationData(queryClient);
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
    invalidateImplementationData(queryClient);
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h1 className="text-2xl font-bold text-slate-800">Implementations</h1>
            <div className="overflow-x-auto">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {IMPLEMENTATION_STAGE_TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => changeStageCategory(t.value)}
                    className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium whitespace-nowrap transition-colors ${stageCategory === t.value ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button onClick={() => { setEditingId(null); setForm(blankForm); setDrawerOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> New Project
          </button>
        </div>
        <p className="text-slate-500">Track project implementations and delivery</p>
      </div>

      {/* Search & Filters — filter fields sit directly beside the search
          bar, always visible (no "Filters" button/dropdown to open first). */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end lg:flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
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
          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <AddableSelect
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setPage(0); }}
                options={[{ value: '', label: 'All Statuses' }, ...IMPL_STATUSES.map(s => ({ value: s.value, label: s.label }))]}
                placeholder="All Statuses"
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-slate-600 mb-1">Business Vertical</label>
              <AddableSelect
                value={verticalFilter}
                onChange={(v) => { setVerticalFilter(v); setPage(0); }}
                options={[{ value: '', label: 'All' }, ...verticalOptions.map(v => ({ value: v.name, label: v.name }))]}
                placeholder="All"
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-slate-600 mb-1">Stage</label>
              <AddableSelect
                value={stageFilter}
                onChange={(v) => { setStageFilter(v); setPage(0); }}
                options={[{ value: '', label: 'All' }, ...STAGES.map(s => ({ value: s, label: s }))]}
                placeholder="All"
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-slate-600 mb-1">Project Manager</label>
              <AddableSelect
                value={managerFilter}
                onChange={(v) => { setManagerFilter(v); setPage(0); }}
                options={[{ value: '', label: 'All' }, ...users.map(u => ({ value: String(u.id), label: u.fullName }))]}
                placeholder="All"
              />
            </div>
          </div>
          {(searchInput || activeFilters > 0) && <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-red-500 sm:mb-2.5">Clear All</button>}
        </div>
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
                    <th className="px-4 py-3 text-left font-semibold text-white">Company</th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('projectName')} className="flex items-center gap-1 font-semibold text-white">
                        Project <SortIcon col="projectName" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden sm:table-cell">Product</th>
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
                      <td className="px-4 py-3 text-slate-600">{impl.companyName}</td>
                      <td className="px-4 py-3 text-slate-600">{impl.linkedProjectName || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{impl.linkedProductName || '-'}</td>
                      {/* The Vertical actually selected on this Implementation
                          (auto-derived from its Project/Product — see the
                          create form's own effect), not the Lead/Company's
                          own separate mapped-verticals tags (impl.businessVerticals) —
                          those are a different concept (which Verticals that
                          Lead does business in generally) and could disagree
                          with the one specific Vertical this record is for. */}
                      <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{impl.verticalName || 'Not assigned'}</td>
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
                <div className="w-28">
                  <AddableSelect
                    value={String(size)}
                    onChange={(v) => { setSize(Number(v)); setPage(0); }}
                    options={[10, 25, 50, 100].map(n => ({ value: String(n), label: String(n) }))}
                    placeholder="Rows per page"
                  />
                </div>
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
                          <AddableSelect
                            disabled={!!editingId}
                            value={form.sourceType}
                            onChange={(v) => {
                              const sourceType = v === 'CUSTOMER' ? 'CUSTOMER' : 'LEAD';
                              // Clearing leadId (and any Project/Product/
                              // Vertical already picked, since all three are
                              // scoped to the old leadId) on switch — the
                              // previously selected record belongs to the
                              // other list.
                              setForm(f => ({ ...f, sourceType, leadId: '', projectId: '', projectName: '', productId: '', verticalId: '' }));
                            }}
                            options={[{ value: 'LEAD', label: 'Lead' }, { value: 'CUSTOMER', label: 'Customer' }]}
                            placeholder="Select Source Type"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Lead / Company *</label>
                          <AddableSelect
                            disabled={!!editingId}
                            value={form.leadId}
                            onChange={(v) => {
                              const leadId = v;
                              // Reset Project/Product (and the Vertical/Head
                              // derived from Project — see that effect's own
                              // comment) — the previous picks belonged to
                              // whichever Lead/Company was selected before,
                              // and must not carry over. Both dropdowns
                              // (scoped to this new leadId) repopulate via
                              // the queries above.
                              setForm(f => ({ ...f, leadId, projectId: '', projectName: '', productId: '', verticalId: '' }));
                              clearFieldError('leadId');
                            }}
                            options={leads.map((lead: Lead) => ({ value: String(lead.id), label: lead.companyName }))}
                            placeholder={form.sourceType === 'CUSTOMER' ? 'Select a customer' : 'Select a lead'}
                            error={!!formErrors.leadId}
                          />
                          {formErrors.leadId && <p className="text-xs text-red-600 mt-1">{formErrors.leadId}</p>}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                            {/* Project and Product are mutually exclusive —
                                picking one disables the other (cleared ->
                                re-enabled), same rule as the Quotation
                                module's own Project/Product pickers. */}
                            <AddableSelect
                              disabled={!form.leadId || !!editingId || !!form.productId}
                              value={form.projectId}
                              onChange={(v) => { setForm(f => ({ ...f, projectId: v })); clearFieldError('project'); }}
                              options={leadProjects.map(p => ({ value: String(p.id), label: p.projectName }))}
                              placeholder={form.leadId ? 'Select project' : 'Select a Lead / Company first'}
                              error={!!formErrors.project}
                            />
                            {formErrors.project && <p className="text-xs text-red-600 mt-1">{formErrors.project}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                            <AddableSelect
                              disabled={!form.leadId || !!editingId || !!form.projectId}
                              value={form.productId}
                              onChange={(v) => { setForm(f => ({ ...f, productId: v })); clearFieldError('project'); }}
                              options={leadProducts.map(p => ({ value: String(p.id), label: p.productName }))}
                              placeholder={form.leadId ? 'Select product' : 'Select a Lead / Company first'}
                              error={!!formErrors.project}
                            />
                            {formErrors.project && <p className="text-xs text-red-600 mt-1">{formErrors.project}</p>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Business Vertical</label>
                            {/* Auto-populated from whichever of Project/
                                Product is selected above — never manually
                                picked (see the effect deriving
                                form.verticalId from selectedProject/
                                selectedProduct). Shown read-only, same
                                convention as Head just to the right. While
                                editing, shows the value actually saved at
                                creation (editingVerticalInfo, server-joined —
                                see its own comment) rather than a live
                                re-derivation, since Project/Product are
                                locked then anyway. */}
                            <p className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-600">
                              {editingId ? (editingVerticalInfo.verticalName || 'Not assigned') : ((selectedProject || selectedProduct)?.verticalName || '—')}
                            </p>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Head</label>
                            <p className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-600">
                              {editingId ? (editingVerticalInfo.headName || 'No head assigned') : ((selectedProject || selectedProduct) ? ((selectedProject || selectedProduct)?.headName || 'No head assigned') : '—')}
                            </p>
                          </div>
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
                          <AddableSelect
                            value={form.currentStage}
                            onChange={(v) => setForm(f => ({ ...f, currentStage: v }))}
                            options={STAGES.map(s => ({ value: s, label: s }))}
                            placeholder="Select stage"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Project Manager</label>
                          <AddableSelect
                            value={form.projectManagerId}
                            onChange={(v) => setForm(f => ({ ...f, projectManagerId: v }))}
                            options={[{ value: '', label: 'Unassigned' }, ...users.map((u) => ({ value: String(u.id), label: u.fullName }))]}
                            placeholder="Unassigned"
                          />
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
