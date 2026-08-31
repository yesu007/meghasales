'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
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
  PlusIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { CUSTOMER_STATUSES } from '@/lib/customerStatus';
import LeadFormDrawer, { SOURCES, blankLeadForm, fetchLeadForEdit, type LeadFormState, type CurrencyOption } from '@/components/leads/LeadFormDrawer';
import CustomerFormDrawer, { blankCustomerForm, type CustomerFormState } from '@/components/customers/CustomerFormDrawer';

// Customers are Leads with status = CONFIRMED (labeled "Converted" — see
// LEAD_STATUSES in src/lib/leadStatus.ts). There is no separate Customer
// entity/table anywhere in this app: Invoices and Quotations already key
// directly off leadId, so a Lead already IS the customer record once
// converted. This page is therefore just the existing /api/leads endpoint,
// always scoped to status=CONFIRMED — no new backend, no duplicate data,
// and nothing can ever go stale (a Lead moved off CONFIRMED simply stops
// appearing here on next fetch, a Lead moved onto CONFIRMED starts
// appearing — both for free, since this is a live query, not a snapshot).
// The lead pipeline status itself isn't shown/editable here (every row is
// always CONFIRMED by definition) — the "Status" column on this page is
// customerStatus (Active/Inactive/On Hold), a separate field tracked only
// for converted customers. Un-converting a customer back to an earlier lead
// stage is done from the Lead detail page, not from this list.
const CUSTOMER_STATUS = 'CONFIRMED';

interface Lead {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string | null;
  mobile: string | null;
  status: string;
  customerStatus: string;
  leadSource: string;
  assignedBaId: number | null;
  assignedBaName: string | null;
  createdAt: string;
  lastFollowUpDate: string | null;
  nextFollowUpDate: string | null;
  followUpCount: number;
  isOverdue: boolean;
}

interface UserOption {
  id: number;
  fullName: string;
}

async function fetchCustomers(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/leads?${query}`);
  if (!res.ok) throw new Error('Failed to fetch customers');
  return res.json();
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

export default function CustomersPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles || []).includes('ADMIN');
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Search, filter, sort, pagination — same conventions as the Leads page,
  // minus the status filter (this list is inherently pre-filtered to
  // Converted) and the New/Followed-up view tabs (not meaningful once a
  // lead has already converted).
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [verticalFilter, setVerticalFilter] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir, status: CUSTOMER_STATUS };
  if (search) params.search = search;
  if (sourceFilter) params.leadSource = sourceFilter;
  if (verticalFilter) params.businessVertical = verticalFilter;
  if (customerStatusFilter) params.customerStatus = customerStatusFilter;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customers', params],
    queryFn: () => fetchCustomers(params),
    placeholderData: (prev: any) => prev,
  });

  const { data: users = [], isError: isUsersError } = useQuery<UserOption[]>({
    queryKey: ['users-for-ba'],
    queryFn: fetchUsers,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load customers');
  }, [isError]);

  useEffect(() => {
    if (isUsersError) toast.error('Failed to load users');
  }, [isUsersError]);

  // Edit drawer — same shared component/state shape as the Leads page.
  const [form, setForm] = useState<LeadFormState>(blankLeadForm);
  const [editingId, setEditingId] = useState<number | null>(null);

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
      const url = `/api/leads/${editingId}`;
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error('Failed to update customer');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer updated!');
      closeDrawer();
    },
    onError: () => toast.error('Failed to update customer'),
  });

  // "+ Create Customer" — Customer-owned create flow. Uses its own
  // drawer/state/endpoint (CustomerFormDrawer -> POST /api/customers)
  // rather than the Lead create form/endpoint above.
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CustomerFormState>(blankCustomerForm);
  const [createFormErrors, setCreateFormErrors] = useState<Record<string, string>>({});

  const closeCreateDrawer = () => { setCreateDrawerOpen(false); setCreateForm(blankCustomerForm); setCreateFormErrors({}); };

  const createMutation = useMutation({
    mutationFn: async (data: CustomerFormState) => {
      const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Failed to create customer');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer created!');
      closeCreateDrawer();
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to create customer'),
  });

  const openEdit = async (id: number) => {
    const data = await fetchLeadForEdit(id);
    if (!data) { toast.error('Failed to load customer'); return; }
    setForm(data);
    setEditingId(id);
    setDrawerOpen(true);
  };

  const deleteCustomer = async (id: number, name: string) => {
    if (!window.confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete customer'); return; }
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    toast.success('Customer deleted');
  };

  const updateCustomerStatus = async (id: number, customerStatus: string) => {
    const res = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerStatus }) });
    if (!res.ok) { toast.error('Failed to update customer status'); return; }
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    toast.success('Customer status updated');
  };

  const assignBa = async (id: number, assignedBaId: string) => {
    const res = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedBaId: assignedBaId || null }) });
    if (!res.ok) { toast.error('Failed to assign owner'); return; }
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    toast.success('Owner assigned');
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(0);
  };

  const clearFilters = () => { setSearchInput(''); setSearch(''); setSourceFilter(''); setVerticalFilter(''); setCustomerStatusFilter(''); setPage(0); };

  const customers: Lead[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const activeFilters = [sourceFilter, verticalFilter, customerStatusFilter].filter(Boolean).length;

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowsUpDownIcon className="h-3 w-3 text-slate-400" />;
    return sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-amber-400" /> : <ChevronDownIcon className="h-3 w-3 text-amber-400" />;
  };

  const getPageNumbers = (current: number, total: number): (number | 'ellipsis')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
    if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
    return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
  };
  const pageNumbers = getPageNumbers(page, totalPages || 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Customers</h1>
          <button onClick={() => setCreateDrawerOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> Create Customer
          </button>
        </div>
        <p className="text-slate-500 text-sm sm:text-base">Leads that have converted to customers</p>
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
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select value={customerStatusFilter} onChange={(e) => { setCustomerStatusFilter(e.target.value); setPage(0); }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
                <option value="">All</option>
                {CUSTOMER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        )}
        {activeFilters > 0 && (
          <div className="flex flex-wrap gap-2">
            {sourceFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Source: {sourceFilter.replace(/_/g,' ')} <button onClick={() => setSourceFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
            {verticalFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">Vertical: {verticalFilter.replace(/_/g,' ')} <button onClick={() => setVerticalFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
            {customerStatusFilter && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700 border border-amber-200">Status: {CUSTOMER_STATUSES.find(s => s.value === customerStatusFilter)?.label} <button onClick={() => setCustomerStatusFilter('')}><XMarkIcon className="h-3 w-3" /></button></span>}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /><p className="mt-4 text-sm text-slate-500">Loading...</p></div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16"><InboxIcon className="h-12 w-12 mx-auto text-slate-300" /><p className="mt-4 text-lg font-medium text-slate-600">No customers yet</p><p className="text-sm text-slate-400 mt-1">Customers appear here once a Lead&apos;s status is set to Converted</p></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('companyName')} className="flex items-center gap-1 font-semibold text-white">Company <SortIcon col="companyName" /></button></th>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('contactPerson')} className="flex items-center gap-1 font-semibold text-white">Contact <SortIcon col="contactPerson" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Mobile</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Source</th>
                    <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Owner</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell"><button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 font-semibold text-white">Created <SortIcon col="createdAt" /></button></th>
                    <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer, idx) => (
                    <tr key={customer.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <Link href={`/dashboard/customers/${customer.id}`} className="hover:text-amber-600 hover:underline">{customer.companyName}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{customer.contactPerson}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{customer.mobile || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell capitalize">{(customer.leadSource || '').replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="px-4 py-3">
                        <select value={customer.customerStatus} onChange={(e) => updateCustomerStatus(customer.id, e.target.value)} className={`px-2 py-1 rounded text-xs font-medium border-0 ${CUSTOMER_STATUSES.find(s => s.value === customer.customerStatus)?.color || 'bg-slate-100'}`}>
                          {CUSTOMER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <select
                          value={customer.assignedBaId || ''}
                          onChange={(e) => assignBa(customer.id, e.target.value)}
                          className="px-2 py-1 rounded text-xs font-medium border border-slate-200 text-slate-700 bg-white focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Unassigned</option>
                          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{dayjs(customer.createdAt).format('DD MMM YYYY')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/customers/${customer.id}`} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 inline-block" title="View">
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                          <button onClick={() => openEdit(customer.id)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteCustomer(customer.id, customer.companyName)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
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

      {/* Edit Customer (Lead) Drawer — same shared form as the Leads page */}
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

      {/* Create Customer Drawer — Customer-owned form/endpoint */}
      <CustomerFormDrawer
        open={createDrawerOpen}
        onClose={closeCreateDrawer}
        form={createForm}
        setForm={setCreateForm}
        formErrors={createFormErrors}
        setFormErrors={setCreateFormErrors}
        onSave={(data) => createMutation.mutate(data)}
        isSaving={createMutation.isPending}
        isAdmin={isAdmin}
        currencies={currencies}
      />
    </div>
  );
}
