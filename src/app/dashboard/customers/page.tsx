'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
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
  EyeIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { CUSTOMER_STATUSES, customerStatusColor } from '@/lib/customerStatus';
import { useLeadSources } from '@/hooks/useLeadSources';
import AddableSelect from '@/components/AddableSelect';
import LeadFormDrawer, { blankLeadForm, fetchLeadForEdit, type LeadFormState, type CurrencyOption } from '@/components/leads/LeadFormDrawer';
import CustomerFormDrawer, { blankCustomerForm, fetchCustomerForEdit, type CustomerFormState } from '@/components/customers/CustomerFormDrawer';
import CustomerProjectsPanel from '@/components/customers/CustomerProjectsPanel';
import CustomerProductsPanel from '@/components/customers/CustomerProductsPanel';
import { invalidateLeadCustomerData, invalidateProjectData, invalidateProductData } from '@/lib/queryInvalidation';

// Customers are Leads with status = CONFIRMED (labeled "Converted" — see
// the LeadStatusOption master, GET /api/lead-status-options). There is no separate Customer
// entity/table anywhere in this app: Invoices and Quotations already key
// directly off leadId, so a Lead already IS the customer record once
// converted. This page is therefore just the existing /api/leads endpoint,
// always scoped to status=CONFIRMED — no new backend, no duplicate data,
// and nothing can ever go stale (a Lead moved off CONFIRMED simply stops
// appearing here on next fetch, a Lead moved onto CONFIRMED starts
// appearing — both for free, since this is a live query, not a snapshot).
// The lead pipeline status itself isn't shown/editable here (every row is
// always CONFIRMED by definition) — un-converting a customer back to an
// earlier lead stage is done from the Lead detail page, not from this list.
// "Status" is customerStatus (Active/In-Active/Hold — see
// src/lib/customerStatus.ts), a separate field tracked only for converted
// customers. Stage is no longer shown at this per-customer level (removed
// per product request, now that each of the customer's own Projects shows
// its own Status/Stage inside the row's own accordion — see
// CustomerProjectsPanel).
const CUSTOMER_STATUS = 'CONFIRMED';

interface Lead {
  id: number;
  companyName: string;
  projectName: string | null;
  contactPerson: string;
  email: string | null;
  mobile: string | null;
  status: string;
  customerStatus: string;
  leadSource: string;
  businessVerticals: string | null;
  assignedBaId: number | null;
  assignedBaName: string | null;
  createdAt: string;
  // Conversion moment (Lead→Customer) — what the "Created" column below
  // actually displays. See schema.prisma's Lead.confirmedAt comment. Falls
  // back to createdAt for any pre-existing row where it's somehow unset.
  confirmedAt: string | null;
  lastFollowUpDate: string | null;
  nextFollowUpDate: string | null;
  followUpCount: number;
  isOverdue: boolean;
  // Created directly from this module vs. converted from a Lead — see
  // GET /api/leads's own includeSource comment for the signal this reuses.
  // Decides which form the Edit action opens (see openEdit below).
  isDirectCustomer: boolean;
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
  const SOURCES = useLeadSources();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Project accordion — same expandedId + chevron-toggle pattern as the
  // Project module's own (src/app/dashboard/projects/page.tsx), just
  // expanding to this Customer's own Projects (CustomerProjectsPanel)
  // instead of Budget Estimations.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Search, filter, sort, pagination — same conventions as the Leads page,
  // minus the status filter (this list is inherently pre-filtered to
  // Converted) and the New/Followed-up view tabs (not meaningful once a
  // lead has already converted).
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [verticalFilter, setVerticalFilter] = useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('confirmedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir, status: CUSTOMER_STATUS, includeSource: 'true' };
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

  // headId is only used by the Edit Customer drawer's own Product field
  // (see saveMutation below, and the Product Master's own "Vertical has no
  // Head assigned" rule it reuses) — the filter dropdown further below just
  // ignores the extra field.
  const { data: verticalOptions = [] } = useQuery<{ id: number; name: string; headId: number | null }[]>({
    queryKey: ['verticals'],
    queryFn: async () => { const res = await fetch('/api/verticals'); if (!res.ok) throw new Error('Failed to fetch verticals'); return res.json(); },
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  // customerStatus lives outside LeadFormState (shared with the Leads
  // module's own use of this same drawer — see LeadFormDrawer's own
  // comment) — tracked here instead, and merged into the PUT body below.
  const [editCustomerStatus, setEditCustomerStatus] = useState('ACTIVE');

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankLeadForm); setEditCustomerStatus('ACTIVE'); setFormErrors({}); };

  const saveMutation = useMutation({
    mutationFn: async (data: LeadFormState) => {
      const url = `/api/leads/${editingId}`;
      const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, customerStatus: editCustomerStatus }) });
      if (!res.ok) throw new Error('Failed to update customer');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      invalidateLeadCustomerData(queryClient);
      toast.success('Customer updated!');
      closeDrawer();
    },
    onError: () => toast.error('Failed to update customer'),
  });

  // "+ Create Customer" — Customer-owned create/edit flow. Uses its own
  // drawer/state/endpoint (CustomerFormDrawer -> POST /api/customers)
  // rather than the Lead form/endpoint above. Also reused for editing a
  // directly-created Customer (editingCustomerId set — see openCustomerEdit
  // below and the Edit button's own routing) — the *Original* trio is what
  // fetchCustomerForEdit loaded, compared against the live form at save
  // time to tell whether the user actually changed the Project/Product
  // (see createMutation's own edit branch).
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CustomerFormState>(blankCustomerForm);
  const [createFormErrors, setCreateFormErrors] = useState<Record<string, string>>({});
  const [editingCustomerId, setEditingCustomerId] = useState<number | null>(null);
  const [editingCustomerOriginalProjectId, setEditingCustomerOriginalProjectId] = useState<number | null>(null);
  const [editingCustomerOriginalProductId, setEditingCustomerOriginalProductId] = useState<number | null>(null);
  const [editingCustomerOriginalProductVerticalId, setEditingCustomerOriginalProductVerticalId] = useState('');
  const [editingCustomerOriginalStage, setEditingCustomerOriginalStage] = useState('');
  const [editingCustomerOriginalImplementationId, setEditingCustomerOriginalImplementationId] = useState<number | null>(null);
  // "+ Add Customer" round-trip from another module's own Customer dropdown
  // (currently just Project's — see ProjectFormDrawer's own onAddCustomer)
  // — set from ?returnTo=<path> when ?openCreate=true auto-opens this same
  // Create Customer drawer below; createMutation's own onSuccess navigates
  // back there (with the new customer's id) instead of just closing the
  // drawer, only when this is actually set.
  const [returnTo, setReturnTo] = useState<string | null>(null);

  const openedFromCustomerRoundTrip = useRef(false);
  useEffect(() => {
    // The ref guard matters here for the same reason as the Projects
    // page's own restore effect — React Strict Mode's dev-only
    // double-invoke would otherwise run this twice before router.replace
    // below actually takes effect.
    if (searchParams.get('openCreate') !== 'true' || openedFromCustomerRoundTrip.current) return;
    openedFromCustomerRoundTrip.current = true;
    setReturnTo(searchParams.get('returnTo'));
    setCreateDrawerOpen(true);
    router.replace('/dashboard/customers');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only ever
    // meant to react to the URL actually carrying ?openCreate, not to
    // re-run on every searchParams identity change or router.replace above
    // re-triggering it.
  }, [searchParams]);

  const closeCreateDrawer = () => {
    setCreateDrawerOpen(false); setCreateForm(blankCustomerForm); setCreateFormErrors({});
    setEditingCustomerId(null); setEditingCustomerOriginalProjectId(null); setEditingCustomerOriginalProductId(null); setEditingCustomerOriginalProductVerticalId('');
    setEditingCustomerOriginalStage(''); setEditingCustomerOriginalImplementationId(null);
    // Cleared even on a plain Cancel (not just after a successful
    // round-trip save) — otherwise a later, unrelated "+ Create Customer"
    // click would incorrectly redirect back to wherever an earlier
    // round-trip came from (see the ?openCreate effect above).
    setReturnTo(null);
  };

  const openCustomerEdit = async (id: number) => {
    const result = await fetchCustomerForEdit(id);
    if (!result) { toast.error('Failed to load customer'); return; }
    setCreateForm(result.form);
    setEditingCustomerId(id);
    setEditingCustomerOriginalProjectId(result.originalProjectId);
    setEditingCustomerOriginalProductId(result.originalProductId);
    setEditingCustomerOriginalProductVerticalId(result.originalProductVerticalId);
    setEditingCustomerOriginalStage(result.form.stage);
    setEditingCustomerOriginalImplementationId(result.originalImplementationId);
    setCreateFormErrors({});
    setCreateDrawerOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async (data: CustomerFormState) => {
      if (editingCustomerId) {
        // Editing a directly-created Customer — the customer already
        // exists, so unlike Create there's no ordering problem to work
        // around: a new Project/Product is just created directly (owned by
        // this same customer id) and linked in a second call, same as
        // LeadFormDrawer's own Edit-mode Product handling.
        const putBody: any = { ...data };
        if (data.productOrProject === 'PROJECT') {
          if (data.isNewProject) {
            const projRes = await fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectName: data.newProjectName.trim(), customerId: editingCustomerId, verticalId: data.newProjectVerticalId, budget: 0 }),
            });
            if (!projRes.ok) {
              const b = await projRes.json().catch(() => null);
              throw new Error(b?.message || 'Failed to create the new Project');
            }
            const newProject = await projRes.json();
            putBody.projectId = newProject.id;
          } else {
            putBody.projectId = data.projectId;
          }
          putBody.productId = '';
        } else if (data.productOrProject === 'PRODUCT') {
          // Product Master rows are one-per-Customer (see the Product
          // model's own comment) — a change here updates this Customer's
          // existing Product row in place, or creates a fresh one if it
          // doesn't have one yet, never re-points at someone else's row.
          // Skipped entirely if the field wasn't actually changed.
          if (data.newProductVerticalId && data.newProductVerticalId !== editingCustomerOriginalProductVerticalId) {
            const vertical = verticalOptions.find((v) => v.id === Number(data.newProductVerticalId));
            if (!vertical) throw new Error('Selected product was not found');
            if (!vertical.headId) throw new Error("Selected product's vertical has no Head assigned");
            if (editingCustomerOriginalProductId) {
              const patchRes = await fetch(`/api/products/${editingCustomerOriginalProductId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productName: vertical.name, verticalId: vertical.id }),
              });
              if (!patchRes.ok) {
                const b = await patchRes.json().catch(() => null);
                throw new Error(b?.message || 'Failed to update the Product');
              }
            } else {
              const createRes = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productName: vertical.name, verticalId: vertical.id, customerId: editingCustomerId, budget: 0 }),
              });
              if (!createRes.ok) {
                const b = await createRes.json().catch(() => null);
                throw new Error(b?.message || 'Failed to create the new Product');
              }
              const newProduct = await createRes.json();
              putBody.productId = newProduct.id;
            }
          }
          putBody.projectId = '';
        } else {
          // "None" selected — unlink both.
          putBody.projectId = '';
          putBody.productId = '';
        }

        const res = await fetch(`/api/leads/${editingCustomerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(putBody) });
        if (!res.ok) {
          const errBody = await res.json().catch(() => null);
          throw new Error(errBody?.message || 'Failed to update customer');
        }
        const updated = await res.json();

        // Stage — reads/writes this Customer's own most-recently-created
        // Implementation (see fetchCustomerForEdit's own comment), the
        // same record POST /api/customers creates up front from this same
        // field at creation. Skipped entirely if unchanged.
        if (data.stage !== editingCustomerOriginalStage) {
          if (editingCustomerOriginalImplementationId) {
            const stageRes = await fetch(`/api/implementations/${editingCustomerOriginalImplementationId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ currentStage: data.stage || null }),
            });
            if (!stageRes.ok) throw new Error('Customer updated, but the Stage update failed');
          } else if (data.stage) {
            const stageRes = await fetch('/api/implementations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ leadId: editingCustomerId, sourceType: 'CUSTOMER', currentStage: data.stage }),
            });
            if (!stageRes.ok) throw new Error('Customer updated, but the Stage failed to save');
          }
        }

        return updated;
      }

      // "Create New Project"/Product sub-flows — sent as
      // body.newProject = { projectName, verticalId } / body.newProduct =
      // { verticalId } in this SAME request, rather than as separate
      // follow-up calls. POST /api/customers validates the Vertical/Head
      // and creates the Customer + Project/Product (linking them) inside
      // one database transaction, so this is never left with a Customer
      // that exists but no Project/Product (the previous "Customer
      // created, but the new Project failed" bug, from an earlier version
      // of this flow that made separate requests) — either both are
      // created and linked, or neither is.
      const body: any = { ...data };
      if (data.productOrProject === 'PROJECT' && data.isNewProject) {
        body.newProject = { projectName: data.newProjectName.trim(), verticalId: data.newProjectVerticalId };
        body.projectId = '';
      }
      if (data.productOrProject === 'PRODUCT' && data.newProductVerticalId) {
        body.newProduct = { verticalId: data.newProductVerticalId };
      }
      const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.message || 'Failed to create customer');
      }
      return res.json();
    },
    onSuccess: (result, variables) => {
      const wasEditing = !!editingCustomerId;
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      invalidateLeadCustomerData(queryClient);
      // Any interaction with either field can change Project/Product Master
      // data (a new row, an in-place update, or just a different
      // linkedLeadsCount) — safe to invalidate whenever that field was
      // touched at all, create or edit.
      if (variables.productOrProject === 'PROJECT') invalidateProjectData(queryClient);
      if (variables.productOrProject === 'PRODUCT') invalidateProductData(queryClient);
      toast.success(wasEditing ? 'Customer updated!' : 'Customer created!');
      // "+ Add Customer" round-trip (see the ?openCreate effect above) —
      // only ever set for a fresh create, never while editing, so this
      // can't fire from the Edit Customer flow.
      const backTo = !wasEditing ? returnTo : null;
      closeCreateDrawer();
      if (backTo) router.push(`${backTo}?newCustomerId=${result.id}`);
    },
    onError: (error: Error) => toast.error(error.message || (editingCustomerId ? 'Failed to update customer' : 'Failed to create customer')),
  });

  const openEdit = async (id: number) => {
    const data = await fetchLeadForEdit(id);
    if (!data) { toast.error('Failed to load customer'); return; }
    setForm(data);
    setEditCustomerStatus(customers.find(c => c.id === id)?.customerStatus || 'ACTIVE');
    setEditingId(id);
    // Guards against a still-open drawer's stale validation messages from a
    // previous failed create attempt bleeding into this edit — closeDrawer
    // already clears this on the normal Cancel/X path, this is just defense
    // in depth.
    setFormErrors({});
    setDrawerOpen(true);
  };

  const deleteCustomer = async (id: number, name: string) => {
    if (!window.confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete customer'); return; }
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    invalidateLeadCustomerData(queryClient);
    toast.success('Customer deleted');
  };

  const updateCustomerStatus = async (id: number, customerStatus: string) => {
    const res = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerStatus }) });
    if (!res.ok) { toast.error('Failed to update customer status'); return; }
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    invalidateLeadCustomerData(queryClient);
    toast.success('Customer status updated');
  };

  const assignBa = async (id: number, assignedBaId: string) => {
    const res = await fetch(`/api/leads/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedBaId: assignedBaId || null }) });
    if (!res.ok) { toast.error('Failed to assign owner'); return; }
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    invalidateLeadCustomerData(queryClient);
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

      {/* Search & Filters — filter fields sit directly beside the search
          bar, always visible (no "Filters" button/dropdown to open first). */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-end lg:flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" placeholder="Search by name, company, email, phone..." value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500" />
            {searchInput && <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><XMarkIcon className="h-4 w-4" /></button>}
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-44">
              <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
              <AddableSelect
                value={sourceFilter}
                onChange={(v) => { setSourceFilter(v); setPage(0); }}
                options={[{ value: '', label: 'All Sources' }, ...SOURCES.map(s => ({ value: s.code, label: s.name }))]}
                placeholder="All Sources"
              />
            </div>
            <div className="w-full sm:w-44">
              <label className="block text-xs font-medium text-slate-600 mb-1">Business Vertical</label>
              <AddableSelect
                value={verticalFilter}
                onChange={(v) => { setVerticalFilter(v); setPage(0); }}
                options={[{ value: '', label: 'All' }, ...verticalOptions.map(vo => ({ value: vo.name, label: vo.name }))]}
                placeholder="All"
              />
            </div>
            <div className="w-full sm:w-40">
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <AddableSelect
                value={customerStatusFilter}
                onChange={(v) => { setCustomerStatusFilter(v); setPage(0); }}
                options={[{ value: '', label: 'All' }, ...CUSTOMER_STATUSES.map(s => ({ value: s.value, label: s.label }))]}
                placeholder="All"
              />
            </div>
          </div>
          {(searchInput || activeFilters > 0) && <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-red-500 sm:mb-2.5">Clear All</button>}
        </div>
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
                    <th className="px-2 py-3"></th>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('companyName')} className="flex items-center gap-1 font-semibold text-white">Company <SortIcon col="companyName" /></button></th>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('contactPerson')} className="flex items-center gap-1 font-semibold text-white">Contact <SortIcon col="contactPerson" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Mobile</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Source</th>
                    <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-white hidden lg:table-cell">Owner</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell"><button onClick={() => handleSort('confirmedAt')} className="flex items-center gap-1 font-semibold text-white">Created <SortIcon col="confirmedAt" /></button></th>
                    <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer, idx) => {
                    const isExpanded = expandedId === customer.id;
                    return (
                    <Fragment key={customer.id}>
                    <tr
                      className={`transition-all duration-300 ${
                        isExpanded
                          ? 'bg-amber-50/70'
                          : expandedId !== null
                            ? `${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} opacity-50 blur-[1px]`
                            : `${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60`
                      }`}
                    >
                      <td className="px-2 py-3">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : customer.id)}
                          className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                          title={isExpanded ? 'Hide Projects' : 'Show Projects'}
                        >
                          {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        <Link href={`/dashboard/customers/${customer.id}`} className="hover:text-amber-600 hover:underline">{customer.companyName}</Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{customer.contactPerson}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{customer.mobile || '—'}</td>
                      <td className="px-4 py-3 text-slate-600 hidden lg:table-cell capitalize">{(customer.leadSource || '').replace(/_/g, ' ').toLowerCase()}</td>
                      <td className="px-4 py-3">
                        <select
                          value={customer.customerStatus}
                          onChange={(e) => updateCustomerStatus(customer.id, e.target.value)}
                          className={`px-2 py-1 rounded text-xs font-medium border-0 ${customerStatusColor(customer.customerStatus)}`}
                        >
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
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{dayjs(customer.confirmedAt || customer.createdAt).format('DD MMM YYYY')}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/customers/${customer.id}`} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 inline-block" title="View">
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                          {/* Directly-created Customers open the Customer
                              Module's own Edit form (CustomerFormDrawer);
                              Lead-converted ones keep opening the Lead
                              Edit form (LeadFormDrawer) as before — see
                              isDirectCustomer's own comment for the signal
                              this reuses. */}
                          <button onClick={() => (customer.isDirectCustomer ? openCustomerEdit(customer.id) : openEdit(customer.id))} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteCustomer(customer.id, customer.companyName)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    <tr className={expandedId !== null && !isExpanded ? 'opacity-50 blur-[1px] transition-all duration-300' : 'transition-all duration-300'}>
                      <td colSpan={9} className="p-0 border-0">
                        {/* Height-animated via CSS grid-template-rows (0fr <-> 1fr) — the
                            standard way to transition an "auto" height, since a table
                            cell can't transition max-height/height reliably. Always
                            mounted (enabled=isExpanded keeps the fetch lazy, same as
                            before) so both expand AND collapse animate smoothly instead
                            of the row just appearing/disappearing. */}
                        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                          <div className="overflow-hidden">
                            <div className={`px-6 ${isExpanded ? 'bg-amber-50/40 border-t border-amber-100' : 'bg-slate-50/60'}`}>
                              <CustomerProjectsPanel customerId={customer.id} enabled={isExpanded} />
                              <CustomerProductsPanel customerId={customer.id} enabled={isExpanded} />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                    </Fragment>
                    );
                  })}
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
                    placeholder="Rows"
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
        customerStatus={editCustomerStatus}
        onCustomerStatusChange={setEditCustomerStatus}
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
        editingId={editingCustomerId}
        // Disabled only when this Create drawer was opened via a Project/
        // Product module's own "+ Add Customer" round-trip (returnTo set)
        // — that flow handles the Project/Product association itself once
        // the user returns there, so picking one here too would be
        // redundant/conflicting. A plain "+ Create Customer" click on this
        // page (returnTo unset) and Edit both leave it enabled/as-is. See
        // CustomerFormDrawer's own disableProductProject comment.
        disableProductProject={!editingCustomerId && !!returnTo}
      />
    </div>
  );
}
