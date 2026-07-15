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
  FunnelIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const DEMO_TYPES = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'ONSITE', label: 'On-site' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const DEMO_STATUSES = [
  { value: 'SCHEDULED', label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-green-100 text-green-700' },
  { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-700' },
  { value: 'RESCHEDULED', label: 'Rescheduled', color: 'bg-purple-100 text-purple-700' },
];

const INTEREST_LEVELS = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const NEXT_ACTIONS = [
  { value: 'SCHEDULE_DEMO_2', label: 'Schedule Demo 2' },
  { value: 'SEND_QUOTATION', label: 'Send Quotation' },
  { value: 'REQUIREMENT_GATHERING', label: 'Requirement Gathering' },
  { value: 'FOLLOW_UP', label: 'Follow Up Later' },
];

// Interest level and next action only apply once a demo has actually taken place
const isOutcomeApplicable = (status: string, hasExistingValue: boolean) =>
  ['IN_PROGRESS', 'COMPLETED'].includes(status) || hasExistingValue;

// Rescheduling only makes sense for demos that haven't already concluded
const isReschedulable = (status: string) => ['SCHEDULED', 'RESCHEDULED'].includes(status);

interface Demo {
  id: number;
  leadId: number;
  companyName: string;
  contactPerson: string;
  mobile: string | null;
  demoType: string;
  scheduledDate: string | null;
  actualDate: string | null;
  status: string;
  assignedToId: number | null;
  assignedToName: string | null;
  attendees: string | null;
  modulesDemonstrated: string | null;
  customerInterestLevel: string | null;
  feedback: string | null;
  nextAction: string | null;
  approvalStatus: string | null;
  createdAt: string;
}

interface Lead {
  id: number;
  companyName: string;
  contactPerson: string;
}

interface UserOption {
  id: number;
  fullName: string;
}

async function fetchDemos(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/demos?${query}`);
  if (!res.ok) throw new Error('Failed to fetch demos');
  return res.json();
}

async function fetchLeads(): Promise<Lead[]> {
  const res = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch leads');
  const data = await res.json();
  return data.content;
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

export default function DemosPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Search, filter, sort, pagination
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('scheduledDate');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const size = 10;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Build query params
  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir };
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;
  if (typeFilter) params.demoType = typeFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['demos', params],
    queryFn: () => fetchDemos(params),
    placeholderData: (prev: any) => prev,
  });

  // Fetch leads for the create form
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-for-demo'],
    queryFn: fetchLeads,
  });

  // Fetch users for the Assigned To dropdown
  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['users-for-demo'],
    queryFn: fetchUsers,
  });

  // Create/edit demo form
  const blankForm = { leadId: '', demoType: '', scheduledDate: '', assignedToId: '', attendees: '', modulesDemonstrated: '' };
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankForm); };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editingId ? `/api/demos/${editingId}` : '/api/demos';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(editingId ? 'Failed to update demo' : 'Failed to schedule demo');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demos'] });
      toast.success(editingId ? 'Demo updated!' : 'Demo scheduled successfully!');
      closeDrawer();
    },
    onError: () => toast.error(editingId ? 'Failed to update demo' : 'Failed to schedule demo'),
  });

  const openEdit = (demo: Demo) => {
    setForm({
      leadId: String(demo.leadId),
      demoType: demo.demoType,
      scheduledDate: demo.scheduledDate ? dayjs(demo.scheduledDate).format('YYYY-MM-DDTHH:mm') : '',
      assignedToId: demo.assignedToId ? String(demo.assignedToId) : '',
      attendees: demo.attendees || '',
      modulesDemonstrated: demo.modulesDemonstrated || '',
    });
    setEditingId(demo.id);
    setDrawerOpen(true);
  };

  const deleteDemo = async (id: number, company: string) => {
    if (!window.confirm(`Delete demo for "${company}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/demos/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete demo'); return; }
    queryClient.invalidateQueries({ queryKey: ['demos'] });
    toast.success('Demo deleted');
  };

  const updateDemo = async (id: number, patch: Record<string, any>, successMsg: string) => {
    const res = await fetch(`/api/demos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error('Failed to update demo');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['demos'] });
    toast.success(successMsg);
  };

  const updateStatus = (id: number, status: string) => updateDemo(id, { status }, 'Status updated');
  const assignTo = (id: number, assignedToId: string) => updateDemo(id, { assignedToId: assignedToId || null }, 'Assigned to updated');
  const updateInterest = (id: number, customerInterestLevel: string) => updateDemo(id, { customerInterestLevel: customerInterestLevel || null }, 'Interest level updated');
  const updateNextAction = (id: number, nextAction: string) => updateDemo(id, { nextAction: nextAction || null }, 'Next action updated');
  const rescheduleDemo = (id: number, scheduledDate: string) => {
    if (!scheduledDate) return;
    updateDemo(id, { scheduledDate: new Date(scheduledDate).toISOString(), status: 'RESCHEDULED' }, 'Demo rescheduled');
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(0);
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setStatusFilter(''); setTypeFilter(''); setPage(0);
  };

  const demos: Demo[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const activeFilters = [statusFilter, typeFilter].filter(Boolean).length;

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowsUpDownIcon className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-amber-600" /> : <ChevronDownIcon className="h-3 w-3 text-amber-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Demos</h1>
          <p className="text-slate-500 mt-1">Schedule and manage product demonstrations</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm(blankForm); setDrawerOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> Schedule Demo
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by company, contact, modules..."
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
            {DEMO_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Types</option>
            {DEMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium ${activeFilters > 0 ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-300 text-slate-600'}`}
          >
            <FunnelIcon className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{activeFilters}</span>}
          </button>
          {(searchInput || activeFilters > 0) && (
            <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-red-500">Clear All</button>
          )}
        </div>
        {activeFilters > 0 && (
          <div className="flex flex-wrap gap-2">
            {statusFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                Status: {DEMO_STATUSES.find(s => s.value === statusFilter)?.label}
                <button onClick={() => setStatusFilter('')}><XMarkIcon className="h-3 w-3" /></button>
              </span>
            )}
            {typeFilter && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">
                Type: {DEMO_TYPES.find(t => t.value === typeFilter)?.label}
                <button onClick={() => setTypeFilter('')}><XMarkIcon className="h-3 w-3" /></button>
              </span>
            )}
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
        ) : demos.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No demos found</p>
            <p className="text-sm text-slate-400 mt-1">Schedule a demo to get started</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Company <SortIcon col="createdAt" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Contact</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('scheduledDate')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Scheduled <SortIcon col="scheduledDate" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('status')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Status <SortIcon col="status" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Assigned To</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden xl:table-cell">Interest</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden xl:table-cell">Next Action</th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {demos.map((demo) => (
                    <tr key={demo.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{demo.companyName}</td>
                      <td className="px-4 py-3 text-slate-600">{demo.contactPerson}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                          {DEMO_TYPES.find(t => t.value === demo.demoType)?.label || demo.demoType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {isReschedulable(demo.status) ? (
                          <input
                            type="datetime-local"
                            value={demo.scheduledDate ? dayjs(demo.scheduledDate).format('YYYY-MM-DDTHH:mm') : ''}
                            onChange={(e) => rescheduleDemo(demo.id, e.target.value)}
                            className="px-2 py-1 border border-slate-200 rounded text-xs text-slate-700 focus:ring-2 focus:ring-amber-500"
                          />
                        ) : (
                          demo.scheduledDate ? dayjs(demo.scheduledDate).format('DD MMM YYYY, h:mm A') : '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={demo.status}
                          onChange={(e) => updateStatus(demo.id, e.target.value)}
                          className={`px-2 py-1 rounded text-xs font-medium border-0 ${DEMO_STATUSES.find(s => s.value === demo.status)?.color || 'bg-slate-100 text-slate-700'}`}
                        >
                          {DEMO_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <select
                          value={demo.assignedToId || ''}
                          onChange={(e) => assignTo(demo.id, e.target.value)}
                          className="px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Unassigned</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {isOutcomeApplicable(demo.status, !!demo.customerInterestLevel) ? (
                          <select
                            value={demo.customerInterestLevel || ''}
                            onChange={(e) => updateInterest(demo.id, e.target.value)}
                            className={`px-2 py-1 rounded text-xs font-medium border-0 ${
                              demo.customerInterestLevel === 'HIGH' ? 'bg-green-100 text-green-700' :
                              demo.customerInterestLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                              demo.customerInterestLevel === 'LOW' ? 'bg-red-100 text-red-700' :
                              'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <option value="">Select</option>
                            {INTEREST_LEVELS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                          </select>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">
                        {isOutcomeApplicable(demo.status, !!demo.nextAction) ? (
                          <select
                            value={demo.nextAction || ''}
                            onChange={(e) => updateNextAction(demo.id, e.target.value)}
                            className="px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">Select</option>
                            {NEXT_ACTIONS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                          </select>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(demo)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteDemo(demo.id, demo.companyName)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
                  <ChevronLeftIcon className="h-4 w-4 text-slate-600" />
                </button>
                <span className="text-sm font-medium text-slate-700">{page + 1} / {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
                  <ChevronRightIcon className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Demo Drawer */}
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
                      <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Demo' : 'Schedule Demo'}</Dialog.Title>
                      <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
                      className="flex-1 px-6 py-4 space-y-4"
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Lead / Company *</label>
                          <select
                            required
                            disabled={!!editingId}
                            title={editingId ? 'Lead cannot be changed after creation' : undefined}
                            value={form.leadId}
                            onChange={(e) => setForm(f => ({ ...f, leadId: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
                          >
                            <option value="">Select a lead</option>
                            {leads.map((lead: Lead) => (
                              <option key={lead.id} value={lead.id}>
                                {lead.companyName} — {lead.contactPerson}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Demo Type *</label>
                            <select
                              required
                              value={form.demoType}
                              onChange={(e) => setForm(f => ({ ...f, demoType: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                            >
                              <option value="">Select type</option>
                              {DEMO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Scheduled Date & Time *</label>
                            <input
                              required
                              type="datetime-local"
                              value={form.scheduledDate}
                              onChange={(e) => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
                          <select
                            value={form.assignedToId}
                            onChange={(e) => setForm(f => ({ ...f, assignedToId: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">Unassigned</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.fullName}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Attendees</label>
                          <input
                            placeholder="Names of attendees (comma-separated)"
                            value={form.attendees}
                            onChange={(e) => setForm(f => ({ ...f, attendees: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Modules to Demonstrate</label>
                          <textarea
                            rows={3}
                            placeholder="List modules to be demonstrated..."
                            value={form.modulesDemonstrated}
                            onChange={(e) => setForm(f => ({ ...f, modulesDemonstrated: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={closeDrawer} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saveMutation.isPending}
                          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                        >
                          {saveMutation.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Schedule Demo'}
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
