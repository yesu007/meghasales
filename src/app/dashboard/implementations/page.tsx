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
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

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
  projectName: string | null;
  companyName: string;
  contactPerson: string;
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

export default function ImplementationsPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const size = 10;

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir };
  if (search) params.search = search;
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['implementations', params],
    queryFn: () => fetchImplementations(params),
    placeholderData: (prev: any) => prev,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads-for-impl'],
    queryFn: fetchLeads,
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['users-for-impl'],
    queryFn: fetchUsers,
  });

  const [form, setForm] = useState({
    leadId: '',
    projectName: '',
    startDate: '',
    targetEndDate: '',
    currentStage: '',
    projectManagerId: '',
    notes: '',
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/implementations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create implementation');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['implementations'] });
      toast.success('Implementation project created!');
      setForm({ leadId: '', projectName: '', startDate: '', targetEndDate: '', currentStage: '', projectManagerId: '', notes: '' });
      setDrawerOpen(false);
    },
    onError: () => toast.error('Failed to create implementation'),
  });

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Implementations</h1>
          <p className="text-slate-500 mt-1">Track project implementations and delivery</p>
        </div>
        <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
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
          {(searchInput || statusFilter) && (
            <button onClick={() => { setSearchInput(''); setSearch(''); setStatusFilter(''); setPage(0); }} className="text-sm text-slate-500 hover:text-red-500">
              Clear
            </button>
          )}
        </div>
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
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('projectName')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Project <SortIcon col="projectName" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Company</th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('status')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Status <SortIcon col="status" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden md:table-cell">Stage</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">
                      <button onClick={() => handleSort('startDate')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Start <SortIcon col="startDate" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">
                      <button onClick={() => handleSort('targetEndDate')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Target End <SortIcon col="targetEndDate" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden xl:table-cell">Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {implementations.map((impl) => (
                    <tr key={impl.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{impl.projectName || `Project #${impl.id}`}</td>
                      <td className="px-4 py-3 text-slate-600">{impl.companyName}</td>
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

      {/* Create Implementation Drawer */}
      <Transition appear show={drawerOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setDrawerOpen(false)}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                <Dialog.Panel className="w-screen max-w-lg">
                  <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                      <Dialog.Title className="text-lg font-semibold text-slate-800">New Implementation Project</Dialog.Title>
                      <button onClick={() => setDrawerOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="flex-1 px-6 py-4 space-y-4">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Lead / Company *</label>
                          <select
                            required
                            value={form.leadId}
                            onChange={(e) => setForm(f => ({ ...f, leadId: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">Select a lead</option>
                            {leads.map((lead: Lead) => (
                              <option key={lead.id} value={lead.id}>
                                {lead.companyName} — {lead.contactPerson}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                          <input
                            value={form.projectName}
                            onChange={(e) => setForm(f => ({ ...f, projectName: e.target.value }))}
                            placeholder="e.g., MeghaJewels ERP Implementation"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          />
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
                        <button type="button" onClick={() => setDrawerOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                          Cancel
                        </button>
                        <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                          {createMutation.isPending ? 'Creating...' : 'Create Project'}
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
