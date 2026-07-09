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
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const SOURCES = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'TRADE_SHOW', label: 'Trade Show' },
  { value: 'COLD_CALL', label: 'Cold Call' },
  { value: 'SALES_EXECUTIVE', label: 'Sales Executive' },
];

const STATUSES = [
  { value: 'NEW', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-amber-100 text-amber-700' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-green-100 text-green-700' },
  { value: 'DISQUALIFIED', label: 'Disqualified', color: 'bg-red-100 text-red-700' },
];

const VERTICALS = [
  { value: 'TRADING', label: 'Trading' },
  { value: 'JEWELLERY', label: 'Jewellery' },
  { value: 'MANUFACTURING', label: 'Manufacturing' },
  { value: 'TRADING_MANUFACTURING', label: 'Trading + Manufacturing' },
  { value: 'TRADING_JEWELLERY_MANUFACTURING', label: 'Trading + Jewellery + Manufacturing' },
];

interface Lead {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string | null;
  mobile: string | null;
  status: string;
  leadSource: string;
  assignedBaId: number | null;
  assignedBaName: string | null;
  createdAt: string;
}

interface UserOption {
  id: number;
  fullName: string;
}

async function fetchLeads(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/leads?${query}`);
  if (!res.ok) throw new Error('Failed to fetch leads');
  return res.json();
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Search, filter, sort, pagination
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [verticalFilter, setVerticalFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
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
  if (sourceFilter) params.leadSource = sourceFilter;
  if (verticalFilter) params.businessVertical = verticalFilter;

  const { data, isLoading } = useQuery({
    queryKey: ['leads', params],
    queryFn: () => fetchLeads(params),
    placeholderData: (prev: any) => prev,
  });

  // Fetch users for BA assignment
  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['users-for-ba'],
    queryFn: fetchUsers,
  });

  // Create lead form
  const [form, setForm] = useState({ companyName: '', contactPerson: '', mobile: '', email: '', leadSource: '', businessVerticals: '', country: '', state: '', city: '', notes: '' });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error('Failed to create lead');
      return res.json();
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`Lead "${lead.companyName}" created!`);
      setForm({ companyName: '', contactPerson: '', mobile: '', email: '', leadSource: '', businessVerticals: '', country: '', state: '', city: '', notes: '' });
      setDrawerOpen(false);
    },
    onError: () => toast.error('Failed to create lead'),
  });

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    toast.success('Status updated');
  };

  const assignBa = async (id: number, assignedBaId: string) => {
    await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedBaId: assignedBaId || null }) });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    toast.success('BA assigned');
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(0);
  };

  const clearFilters = () => { setSearchInput(''); setSearch(''); setStatusFilter(''); setSourceFilter(''); setVerticalFilter(''); setPage(0); };

  const leads: Lead[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const activeFilters = [statusFilter, sourceFilter, verticalFilter].filter(Boolean).length;

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowsUpDownIcon className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-amber-600" /> : <ChevronDownIcon className="h-3 w-3 text-amber-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Leads</h1>
          <p className="text-slate-500 mt-1">Manage and track your leads pipeline</p>
        </div>
        <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> New Lead
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search by name, company, email, phone..." value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            {searchInput && <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><XMarkIcon className="h-4 w-4" /></button>}
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
            <option value="">All Sources</option>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                {VERTICALS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>
        )}
        {activeFilters > 0 && (
          <div className="flex flex-wrap gap-2">
            {statusFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">Status: {statusFilter} <button onClick={() => setStatusFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
            {sourceFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Source: {sourceFilter.replace(/_/g,' ')} <button onClick={() => setSourceFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
            {verticalFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">Vertical: {verticalFilter.replace(/_/g,' ')} <button onClick={() => setVerticalFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /><p className="mt-4 text-sm text-slate-500">Loading...</p></div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16"><InboxIcon className="h-12 w-12 mx-auto text-slate-300" /><p className="mt-4 text-lg font-medium text-slate-600">No leads found</p><p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('companyName')} className="flex items-center gap-1 font-semibold text-slate-700">Company <SortIcon col="companyName" /></button></th>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('contactPerson')} className="flex items-center gap-1 font-semibold text-slate-700">Contact <SortIcon col="contactPerson" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden md:table-cell">Mobile</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Source</th>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('status')} className="flex items-center gap-1 font-semibold text-slate-700">Status <SortIcon col="status" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Assigned BA</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell"><button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 font-semibold text-slate-700">Created <SortIcon col="createdAt" /></button></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {leads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{lead.companyName}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.contactPerson}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{lead.mobile || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell capitalize">{(lead.leadSource || '').replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="px-4 py-3">
                        <select value={lead.status} onChange={(e) => updateStatus(lead.id, e.target.value)} className={`px-2 py-1 rounded text-xs font-medium border-0 ${STATUSES.find(s => s.value === lead.status)?.color || 'bg-slate-100'}`}>
                          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <select
                          value={lead.assignedBaId || ''}
                          onChange={(e) => assignBa(lead.id, e.target.value)}
                          className="px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Unassigned</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{dayjs(lead.createdAt).format('DD MMM YYYY')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeftIcon className="h-4 w-4" /></button>
                <span className="text-sm font-medium">{page + 1} / {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRightIcon className="h-4 w-4" /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create Lead Drawer */}
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
                      <Dialog.Title className="text-lg font-semibold text-slate-800">Create New Lead</Dialog.Title>
                      <button onClick={() => setDrawerOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="flex-1 px-6 py-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                          <input required value={form.companyName} onChange={(e) => setForm(f => ({...f, companyName: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person *</label>
                          <input required value={form.contactPerson} onChange={(e) => setForm(f => ({...f, contactPerson: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Mobile *</label>
                          <input required value={form.mobile} onChange={(e) => setForm(f => ({...f, mobile: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                          <input type="email" value={form.email} onChange={(e) => setForm(f => ({...f, email: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Lead Source *</label>
                          <select required value={form.leadSource} onChange={(e) => setForm(f => ({...f, leadSource: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                            <option value="">Select</option>
                            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Business Vertical</label>
                          <select value={form.businessVerticals} onChange={(e) => setForm(f => ({...f, businessVerticals: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                            <option value="">Select</option>
                            {VERTICALS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                          <input value={form.country} onChange={(e) => setForm(f => ({...f, country: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                          <input value={form.state} onChange={(e) => setForm(f => ({...f, state: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                          <input value={form.city} onChange={(e) => setForm(f => ({...f, city: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                          <textarea rows={3} value={form.notes} onChange={(e) => setForm(f => ({...f, notes: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={() => setDrawerOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                        <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                          {createMutation.isPending ? 'Saving...' : 'Save Lead'}
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
