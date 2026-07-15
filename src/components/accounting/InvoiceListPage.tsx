'use client';

import { useState, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
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
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ArrowDownTrayIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import PaymentEntryDrawer from './PaymentEntryDrawer';

const STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  PENDING: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partially Paid',
  OVERDUE: 'Overdue',
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
};

interface LineItem { id: string; description: string; quantity: number; unitPrice: number }

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  leadId: number;
  companyName: string;
  contactPerson: string;
  project: string | null;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  currencyCode: string;
  status: string;
  displayStatus: string;
  daysOverdue: number;
  accountManagerId: number | null;
  accountManagerName: string | null;
  latestPaymentDate: string | null;
  latestPaymentMethod: string | null;
  latestPaymentReference: string | null;
  latestPaymentNotes: string | null;
  createdAt: string;
}

interface Lead { id: number; companyName: string; contactPerson: string }
interface UserOption { id: number; fullName: string }
interface QuotationOption { id: number; quotationNumber: string; businessModule: string | null; leadId: number }

async function fetchInvoices(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/accounting/invoices?${query}`);
  if (!res.ok) throw new Error('Failed to fetch invoices');
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

async function fetchApprovedQuotations(): Promise<QuotationOption[]> {
  const res = await fetch('/api/quotations?status=APPROVED&size=100');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content.map((q: any) => ({ id: q.id, quotationNumber: q.quotationNumber, businessModule: q.businessModule, leadId: q.leadId }));
}

function fmt(amount: string | number, symbol = '₹'): string {
  return `${symbol} ${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoiceListPage({ mode }: { mode: 'open' | 'paid' }) {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [leadFilter, setLeadFilter] = useState('');
  const [dueDateFrom, setDueDateFrom] = useState('');
  const [dueDateTo, setDueDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState('dueDate');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const size = 10;

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir };
  if (search) params.search = search;
  if (leadFilter) params.leadId = leadFilter;
  if (dueDateFrom) params.dueDateFrom = dueDateFrom;
  if (dueDateTo) params.dueDateTo = dueDateTo;
  if (mode === 'paid') params.status = 'PAID';
  else params.status = overdueOnly ? 'OVERDUE' : 'OPEN';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting-invoices', mode, params],
    queryFn: () => fetchInvoices(params),
    placeholderData: (prev: any) => prev,
  });

  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ['leads-for-invoice'], queryFn: fetchLeads });
  const { data: users = [] } = useQuery<UserOption[]>({ queryKey: ['users-for-invoice'], queryFn: fetchUsers });
  const { data: approvedQuotations = [] } = useQuery<QuotationOption[]>({ queryKey: ['approved-quotations-for-invoice'], queryFn: fetchApprovedQuotations, enabled: mode === 'open' });

  const blankForm = { leadId: '', quotationId: '', dueDate: '', accountManagerId: '', notes: '', taxAmount: '' };
  const [form, setForm] = useState(blankForm);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceRow | null>(null);

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankForm); setLineItems([]); };

  const addLineItem = () => setLineItems((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, description: '', quantity: 1, unitPrice: 0 }]);
  const removeLineItem = (id: string) => setLineItems((prev) => prev.filter((li) => li.id !== id));
  const updateLineItem = (id: string, field: keyof LineItem, value: any) => setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));

  const manualSubtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const manualTax = Number(form.taxAmount) || 0;
  const manualTotal = manualSubtotal + manualTax;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {
        leadId: form.leadId,
        dueDate: form.dueDate,
        accountManagerId: form.accountManagerId || undefined,
        notes: form.notes || undefined,
      };
      if (form.quotationId) {
        body.quotationId = form.quotationId;
      } else {
        body.lineItems = lineItems.map((li) => ({ description: li.description, quantity: li.quantity, unitPrice: li.unitPrice, total: li.quantity * li.unitPrice }));
        body.subtotal = manualSubtotal;
        body.taxAmount = manualTax;
        body.totalAmount = manualTotal;
      }
      const url = editingId ? `/api/accounting/invoices/${editingId}` : '/api/accounting/invoices';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || (editingId ? 'Failed to update invoice' : 'Failed to create invoice'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
      toast.success(editingId ? 'Invoice updated!' : 'Invoice created!');
      closeDrawer();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (inv: InvoiceRow) => {
    setForm({
      leadId: String(inv.leadId),
      quotationId: '',
      dueDate: dayjs(inv.dueDate).format('YYYY-MM-DD'),
      accountManagerId: inv.accountManagerId ? String(inv.accountManagerId) : '',
      notes: '',
      taxAmount: '',
    });
    setEditingId(inv.id);
    setDrawerOpen(true);
  };

  const deleteInvoice = async (id: number, invoiceNumber: string) => {
    if (!window.confirm(`Delete invoice "${invoiceNumber}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/accounting/invoices/${id}`, { method: 'DELETE' });
    if (!res.ok) { const err = await res.json(); toast.error(err.message || 'Failed to delete invoice'); return; }
    queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
    toast.success('Invoice deleted');
  };

  const exportCsv = () => {
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = mode === 'paid'
      ? ['Invoice No', 'Customer', 'Invoice Amount', 'Paid Amount', 'Payment Date', 'Payment Method', 'Reference']
      : ['Invoice No', 'Invoice Date', 'Customer', 'Project', 'Invoice Amount', 'Amount Paid', 'Balance', 'Due Date', 'Days Overdue', 'Status', 'Account Manager'];
    const rows = invoices.map((inv) => mode === 'paid'
      ? [inv.invoiceNumber, inv.companyName, inv.totalAmount, inv.amountPaid, inv.latestPaymentDate ? dayjs(inv.latestPaymentDate).format('YYYY-MM-DD') : '', inv.latestPaymentMethod || '', inv.latestPaymentReference || '']
      : [inv.invoiceNumber, dayjs(inv.invoiceDate).format('YYYY-MM-DD'), inv.companyName, inv.project || '', inv.totalAmount, inv.amountPaid, inv.balanceDue, dayjs(inv.dueDate).format('YYYY-MM-DD'), inv.daysOverdue, STATUS_LABELS[inv.displayStatus] || inv.displayStatus, inv.accountManagerName || '']);
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mode === 'paid' ? 'paid' : 'pending'}-invoices-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
    setPage(0);
  };

  const invoices: InvoiceRow[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowsUpDownIcon className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-amber-600" /> : <ChevronDownIcon className="h-3 w-3 text-amber-600" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{mode === 'paid' ? 'Paid Invoices' : 'Pending Invoices'}</h1>
          <p className="text-slate-500 mt-1">{mode === 'paid' ? 'Fully settled invoices and payment history' : 'Invoices awaiting full payment'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50">
            <ArrowDownTrayIcon className="h-4 w-4" /> Export
          </button>
          {mode === 'open' && (
            <button onClick={() => { setEditingId(null); setForm(blankForm); setLineItems([]); setDrawerOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
              <PlusIcon className="h-4 w-4" /> New Invoice
            </button>
          )}
        </div>
      </div>

      {/* Sticky Search & Filters */}
      <div className="sticky top-0 z-10 bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoice no, customer..."
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
          <select value={leadFilter} onChange={(e) => { setLeadFilter(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
            <option value="">All Customers</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.companyName}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Due From</label>
            <input type="date" value={dueDateFrom} onChange={(e) => { setDueDateFrom(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Due To</label>
            <input type="date" value={dueDateTo} onChange={(e) => { setDueDateTo(e.target.value); setPage(0); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800" />
          </div>
          {mode === 'open' && (
            <label className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm cursor-pointer">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => { setOverdueOnly(e.target.checked); setPage(0); }} className="rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
              Overdue only
            </label>
          )}
          {(searchInput || leadFilter || dueDateFrom || dueDateTo || overdueOnly) && (
            <button onClick={() => { setSearchInput(''); setSearch(''); setLeadFilter(''); setDueDateFrom(''); setDueDateTo(''); setOverdueOnly(false); setPage(0); }} className="text-sm text-slate-500 hover:text-red-500">Clear All</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No {mode === 'paid' ? 'paid' : 'pending'} invoices found</p>
            <p className="text-sm text-slate-400 mt-1">{mode === 'open' ? 'Create an invoice to get started' : 'Try adjusting your search or filters'}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left"><button onClick={() => handleSort('invoiceDate')} className="flex items-center gap-1 font-semibold text-slate-700">Invoice <SortIcon col="invoiceDate" /></button></th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Customer</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden md:table-cell">Project</th>
                    <th className="px-4 py-3 text-right"><button onClick={() => handleSort('totalAmount')} className="flex items-center gap-1 font-semibold text-slate-700 ml-auto">Amount <SortIcon col="totalAmount" /></button></th>
                    {mode === 'open' ? (
                      <>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700 hidden lg:table-cell">Balance</th>
                        <th className="px-4 py-3 text-left"><button onClick={() => handleSort('dueDate')} className="flex items-center gap-1 font-semibold text-slate-700">Due Date <SortIcon col="dueDate" /></button></th>
                        <th className="px-4 py-3 text-center font-semibold text-slate-700 hidden lg:table-cell">Days Overdue</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden xl:table-cell">Manager</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-right font-semibold text-slate-700 hidden md:table-cell">Paid</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Payment Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">Method</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden xl:table-cell">Reference</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{inv.invoiceNumber}</p>
                        <p className="text-xs text-slate-400">{dayjs(inv.invoiceDate).format('DD MMM YYYY')}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{inv.companyName}</p>
                        <p className="text-xs text-slate-500">{inv.contactPerson}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{inv.project || '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(inv.totalAmount)}</td>
                      {mode === 'open' ? (
                        <>
                          <td className="px-4 py-3 text-right text-slate-600 hidden lg:table-cell">{fmt(inv.balanceDue)}</td>
                          <td className="px-4 py-3 text-slate-600">{dayjs(inv.dueDate).format('DD MMM YYYY')}</td>
                          <td className="px-4 py-3 text-center hidden lg:table-cell">{inv.daysOverdue > 0 ? <span className="text-red-600 font-medium">{inv.daysOverdue}</span> : '—'}</td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[inv.displayStatus] || 'bg-slate-100 text-slate-700'}`}>{STATUS_LABELS[inv.displayStatus] || inv.displayStatus}</span></td>
                          <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">{inv.accountManagerName || '—'}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-right text-green-700 font-medium hidden md:table-cell">{fmt(inv.amountPaid)}</td>
                          <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{inv.latestPaymentDate ? dayjs(inv.latestPaymentDate).format('DD MMM YYYY') : '—'}</td>
                          <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">{inv.latestPaymentMethod || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 hidden xl:table-cell">{inv.latestPaymentReference || '—'}</td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/dashboard/accounting/invoices/${inv.id}`} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="View">
                            <EyeIcon className="h-4 w-4" />
                          </Link>
                          {mode === 'open' && (
                            <>
                              <button onClick={() => setPaymentInvoice(inv)} className="p-1.5 rounded text-slate-400 hover:text-green-600 hover:bg-green-50" title="Record Payment">
                                <BanknotesIcon className="h-4 w-4" />
                              </button>
                              <button onClick={() => openEdit(inv)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button onClick={() => deleteInvoice(inv.id, inv.invoiceNumber)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronLeftIcon className="h-4 w-4 text-slate-600" /></button>
                <span className="text-sm font-medium text-slate-700">{page + 1} / {totalPages || 1}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"><ChevronRightIcon className="h-4 w-4 text-slate-600" /></button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit Invoice Drawer */}
      <Transition appear show={drawerOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeDrawer}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                <Dialog.Panel className="w-screen max-w-xl">
                  <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                      <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Invoice' : 'New Invoice'}</Dialog.Title>
                      <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                    </div>
                    <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="flex-1 px-6 py-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Customer / Lead *</label>
                        <select required disabled={!!editingId} value={form.leadId} onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value, quotationId: '' }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500">
                          <option value="">Select a customer</option>
                          {leads.map((l) => <option key={l.id} value={l.id}>{l.companyName} — {l.contactPerson}</option>)}
                        </select>
                      </div>

                      {!editingId && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Generate from Approved Quotation</label>
                          <select value={form.quotationId} onChange={(e) => setForm((f) => ({ ...f, quotationId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                            <option value="">None — enter line items manually</option>
                            {approvedQuotations.filter((q) => !form.leadId || q.leadId === Number(form.leadId)).map((q) => (
                              <option key={q.id} value={q.id}>{q.quotationNumber} — {q.businessModule || 'Custom'}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {!editingId && !form.quotationId && (
                        <div className="space-y-3 border border-slate-200 rounded-lg p-4 bg-slate-50">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700">Line Items *</label>
                            <button type="button" onClick={addLineItem} className="text-xs text-amber-600 hover:text-amber-700 font-medium">+ Add Line</button>
                          </div>
                          {lineItems.map((li) => (
                            <div key={li.id} className="grid grid-cols-12 gap-2 items-center">
                              <input placeholder="Description" value={li.description} onChange={(e) => updateLineItem(li.id, 'description', e.target.value)} className="col-span-6 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                              <input type="number" min={1} placeholder="Qty" value={li.quantity} onChange={(e) => updateLineItem(li.id, 'quantity', Number(e.target.value))} className="col-span-2 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                              <input type="number" min={0} placeholder="Unit Price" value={li.unitPrice} onChange={(e) => updateLineItem(li.id, 'unitPrice', Number(e.target.value))} className="col-span-3 px-2 py-1.5 border border-slate-300 rounded text-sm" />
                              <button type="button" onClick={() => removeLineItem(li.id)} className="col-span-1 text-red-400 hover:text-red-600"><TrashIcon className="h-4 w-4" /></button>
                            </div>
                          ))}
                          {lineItems.length === 0 && <p className="text-xs text-slate-400">No line items yet — click &ldquo;+ Add Line&rdquo;</p>}
                          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                            <div>
                              <label className="text-xs font-medium text-slate-600">Tax Amount</label>
                              <input type="number" min={0} value={form.taxAmount} onChange={(e) => setForm((f) => ({ ...f, taxAmount: e.target.value }))} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm mt-1" />
                            </div>
                            <div className="text-right self-end">
                              <p className="text-xs text-slate-500">Subtotal: {fmt(manualSubtotal)}</p>
                              <p className="text-sm font-semibold text-slate-800">Total: {fmt(manualTotal)}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Due Date *</label>
                          <input required type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Account Manager</label>
                          <select value={form.accountManagerId} onChange={(e) => setForm((f) => ({ ...f, accountManagerId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                            <option value="">Unassigned</option>
                            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={closeDrawer} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                        <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                          {saveMutation.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create Invoice'}
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

      {paymentInvoice && (
        <PaymentEntryDrawer
          isOpen={!!paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          invoiceId={paymentInvoice.id}
          invoiceNumber={paymentInvoice.invoiceNumber}
          balanceDue={Number(paymentInvoice.balanceDue)}
          currencySymbol={paymentInvoice.currencyCode === 'INR' ? '₹' : paymentInvoice.currencyCode}
        />
      )}
    </div>
  );
}
