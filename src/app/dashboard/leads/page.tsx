'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
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
  EyeIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { LEAD_STATUSES } from '@/lib/leadStatus';
import LeadFormDrawer, { SOURCES, blankLeadForm, fetchLeadForEdit, type LeadFormState, type CurrencyOption } from '@/components/leads/LeadFormDrawer';

const VIEW_TABS = [
  { value: '', label: 'All Leads' },
  { value: 'new', label: 'New Leads' },
  { value: 'followed-up', label: 'Followed-up Leads' },
];

const STATUSES = LEAD_STATUSES;

interface Lead {
  id: number;
  companyName: string;
  projectName: string | null;
  contactPerson: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  whatsapp: string | null;
  status: string;
  leadSource: string;
  assignedBaId: number | null;
  assignedBaName: string | null;
  createdAt: string;
  lastFollowUpDate: string | null;
  nextFollowUpDate: string | null;
  followUpCount: number;
  isOverdue: boolean;
}

interface LeadStats {
  totalNew: number;
  pendingFollowUp: number;
  overdueFollowUp: number;
  convertedThisMonth: number;
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
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

export default function LeadsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles || []).includes('ADMIN');
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Summary widgets ("dashboard") visibility, persisted per-browser so the
  // preference sticks across visits. Defaults to collapsed; read from
  // localStorage on mount only (can't touch it during SSR).
  const [showDashboard, setShowDashboard] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('leads-dashboard-visible');
    if (stored !== null) setShowDashboard(stored === 'true');
  }, []);
  const toggleDashboard = () => {
    setShowDashboard((prev) => {
      const next = !prev;
      localStorage.setItem('leads-dashboard-visible', String(next));
      return next;
    });
  };

  // Search, filter, sort, pagination
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [verticalFilter, setVerticalFilter] = useState('');
  const [view, setView] = useState(''); // '' | 'new' | 'followed-up'
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

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
  if (view) params.view = view;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', params],
    queryFn: () => fetchLeads(params),
    placeholderData: (prev: any) => prev,
  });

  const { data: stats } = useQuery<LeadStats>({
    queryKey: ['lead-stats'],
    queryFn: async () => {
      const res = await fetch('/api/leads/stats');
      if (!res.ok) throw new Error('Failed to fetch lead stats');
      return res.json();
    },
  });

  const changeView = (v: string) => {
    setView(v);
    setPage(0);
    // Followed-up Leads is explicitly "sortable by last contacted date" —
    // default to that ordering when the tab is picked, same as any other tab.
    if (v === 'followed-up') { setSortBy('lastFollowUpDate'); setSortDir('desc'); }
    else if (sortBy === 'lastFollowUpDate') { setSortBy('createdAt'); setSortDir('desc'); }
  };

  // Fetch users for BA assignment
  const { data: users = [], isError: isUsersError } = useQuery<UserOption[]>({
    queryKey: ['users-for-ba'],
    queryFn: fetchUsers,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load leads');
  }, [isError]);

  useEffect(() => {
    if (isUsersError) toast.error('Failed to load users');
  }, [isUsersError]);

  // Create/edit lead form — form state lives here (page-owned), rendering
  // and validation live in the shared LeadFormDrawer (also used by the
  // Customers/Converted-Leads page).
  const [form, setForm] = useState<LeadFormState>(blankLeadForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Only Administrators can override the currency a country implies —
  // this list is only fetched/rendered for ADMIN sessions.
  const { data: currencies = [], isError: isCurrenciesError } = useQuery<CurrencyOption[]>({
    queryKey: ['currencies'],
    queryFn: async () => {
      const res = await fetch('/api/currencies?activeOnly=true');
      if (!res.ok) throw new Error('Failed to fetch currencies');
      return res.json();
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (isCurrenciesError) toast.error('Failed to load currencies');
  }, [isCurrenciesError]);

  const { data: verticalOptions = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['verticals'],
    queryFn: async () => { const res = await fetch('/api/verticals'); if (!res.ok) throw new Error('Failed to fetch verticals'); return res.json(); },
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankLeadForm); setFormErrors({}); };

  const saveMutation = useMutation({
    mutationFn: async (data: LeadFormState) => {
      const url = editingId ? `/api/leads/${editingId}` : '/api/leads';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(editingId ? 'Failed to update lead' : 'Failed to create lead');
      return res.json();
    },
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(editingId ? 'Lead updated!' : `Lead "${lead.companyName}" created!`);
      closeDrawer();
    },
    onError: () => toast.error(editingId ? 'Failed to update lead' : 'Failed to create lead'),
  });

  const openEdit = async (id: number) => {
    const data = await fetchLeadForEdit(id);
    if (!data) { toast.error('Failed to load lead'); return; }
    setForm(data);
    setEditingId(id);
    setDrawerOpen(true);
  };

  const deleteLead = async (id: number, name: string) => {
    if (!window.confirm(`Delete lead "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete lead'); return; }
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    toast.success('Lead deleted');
  };

  const updateStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!res.ok) { toast.error('Failed to update status'); return; }
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    toast.success('Status updated');
  };

  const assignBa = async (id: number, assignedBaId: string) => {
    const res = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedBaId: assignedBaId || null }) });
    if (!res.ok) { toast.error('Failed to assign BA'); return; }
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
    if (sortBy !== col) return <ArrowsUpDownIcon className="h-3 w-3 text-slate-400" />;
    return sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-amber-400" /> : <ChevronDownIcon className="h-3 w-3 text-amber-400" />;
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
    <div className="space-y-4">
      {/* Header — title, tabs, New Lead and Show Dashboard are packed
          together on the left instead of being split to opposite edges of
          the row, which left a wide dead strip between the tabs and the
          buttons on anything narrower than a very wide desktop. Any leftover
          width now falls at the true right margin, not mid-row. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {/* Tabs sit on the same row as the H1 — and are vertically centered
              against that single line — instead of against the whole
              two-line title+subtitle block, which threw the alignment off. */}
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Leads</h1>
          <div className="overflow-x-auto">
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
              {VIEW_TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => changeView(t.value)}
                  className={`px-3 py-1.5 min-h-[40px] rounded-md text-sm font-medium whitespace-nowrap transition-colors ${view === t.value ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={toggleDashboard}
            className="flex items-center gap-1 px-2 min-h-[44px] text-sm text-slate-500 hover:text-amber-600 font-medium"
          >
            {showDashboard ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            {showDashboard ? 'Hide Dashboard' : 'Show Dashboard'}
          </button>
          <button onClick={() => { setEditingId(null); setForm(blankLeadForm); setDrawerOpen(true); }} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> New Lead
          </button>
        </div>
        <p className="text-slate-500 text-sm sm:text-base">Manage and track your leads pipeline</p>
      </div>

      {/* Summary widgets */}
      {showDashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-slate-500">Total New Leads</p>
            <p className="text-xl sm:text-2xl font-bold mt-1 text-slate-700">{stats?.totalNew ?? '—'}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-slate-500">Pending Follow-up</p>
            <p className="text-xl sm:text-2xl font-bold mt-1 text-orange-600">{stats?.pendingFollowUp ?? '—'}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-slate-500">Overdue Follow-ups</p>
            <p className="text-xl sm:text-2xl font-bold mt-1 text-red-600">{stats?.overdueFollowUp ?? '—'}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-slate-500">Converted This Month</p>
            <p className="text-xl sm:text-2xl font-bold mt-1 text-green-600">{stats?.convertedThisMonth ?? '—'}</p>
          </div>
        </div>
      )}

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
                {verticalOptions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
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
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('companyName')} className="flex items-center gap-1 font-semibold text-white">Company <SortIcon col="companyName" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Project Name</th>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('contactPerson')} className="flex items-center gap-1 font-semibold text-white">Contact <SortIcon col="contactPerson" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Designation</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Mobile</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">WhatsApp</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Source</th>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('status')} className="flex items-center gap-1 font-semibold text-white">Status <SortIcon col="status" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Assigned BA</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell"><button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 font-semibold text-white">Created <SortIcon col="createdAt" /></button></th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell"><button onClick={() => handleSort('lastFollowUpDate')} className="flex items-center gap-1 font-semibold text-white">Last Follow-up <SortIcon col="lastFollowUpDate" /></button></th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell"><button onClick={() => handleSort('nextFollowUpDate')} className="flex items-center gap-1 font-semibold text-white">Next Follow-up <SortIcon col="nextFollowUpDate" /></button></th>
                    <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead, idx) => (
                    <tr key={lead.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <Link href={`/dashboard/leads/${lead.id}`} className="hover:text-amber-600 hover:underline">{lead.companyName}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{lead.projectName || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{lead.contactPerson}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{lead.designation || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{lead.mobile || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{lead.whatsapp || '—'}</td>
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
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">{lead.lastFollowUpDate ? dayjs(lead.lastFollowUpDate).format('DD MMM YYYY') : '—'}</td>
                      <td className={`px-4 py-3 hidden lg:table-cell ${lead.isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {lead.nextFollowUpDate ? (
                          <span className={lead.isOverdue ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200' : ''}>
                            {dayjs(lead.nextFollowUpDate).format('DD MMM YYYY')}{lead.isOverdue ? ' (Overdue)' : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/leads/${lead.id}`} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 inline-block" title="View">
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                          <button onClick={() => openEdit(lead.id)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteLead(lead.id, lead.companyName)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
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

      {/* Create/Edit Lead Drawer */}
      <LeadFormDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        editingId={editingId}
        form={form}
        setForm={setForm}
        formErrors={formErrors}
        setFormErrors={setFormErrors}
        onSave={(data) => saveMutation.mutate(data)}
        isSaving={saveMutation.isPending}
        isAdmin={isAdmin}
        currencies={currencies}
      />
    </div>
  );
}
