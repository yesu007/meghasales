'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, EyeIcon, PencilIcon, TrashIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';

interface ExpenseSubCategory { id: number; categoryId: number; name: string; isActive: boolean }
interface ExpenseCategory { id: number; name: string; description: string | null; isActive: boolean; subCategories: ExpenseSubCategory[] }
// A standalone (Category, Sub Category) pairing created via the "+ Add"
// form — independent of ExpenseSubCategory's own categoryId ownership.
interface CategoryLink { id: number; categoryId: number; categoryName: string; subCategoryId: number; subCategoryName: string }
interface CurrencyOption { currencyCode: string }
// Vendor dropdown source — Customer module reuses Lead rows (status
// CONFIRMED) rather than a separate customer table, same convention as
// src/app/dashboard/customers/page.tsx and the leadId dropdown in
// InvoiceListPage.tsx.
interface CustomerOption { id: number; companyName: string; contactPerson: string }
interface ExpenseRow {
  id: number;
  expenseNumber: string;
  categoryId: number;
  categoryName: string;
  subCategoryId: number | null;
  subCategoryName: string | null;
  vendor: string | null;
  vendorLeadId: number | null;
  expenseDate: string;
  amount: string;
  currencyCode: string;
  exchangeRate: string;
  paymentMethod: string;
  status: string;
  paidDate: string | null;
  referenceNumber: string | null;
  notes: string | null;
  recordedByName: string | null;
}
interface ExpenseListResponse { content: ExpenseRow[]; page: number; totalPages: number; totalElements: number }

// Page numbers with ellipsis, e.g. 1 2 3 4 … 10
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
  if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
  return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
};
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'UPI', 'OTHER'];
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

// Small reusable modal shell — no dialog component exists elsewhere in the
// app, so this stays local to the Expenses page. Used only for the existing
// Category/Sub Category forms when opened from inside the "+ Add" mapping
// form's dropdowns; the forms themselves are unchanged.
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-md p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-800 mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// Dropdown with an extra "+ Add …" action styled like the page's other
// primary buttons (e.g. "New Expense") — a plain <option> can't carry that
// styling, so the Category/Sub Category selects in the mapping form below
// use this custom dropdown instead of a native <select>.
function AddableSelect({
  value, onChange, options, placeholder, onAdd, addLabel, disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  onAdd: () => void;
  addLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between text-left ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white'}`}
      >
        <span className={selected ? 'text-slate-800' : 'text-slate-400'}>{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon className="h-4 w-4 text-slate-400 shrink-0" />
      </button>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col max-h-56">
            {/* Only this options list scrolls — the "+ Add …" button below
                stays fixed at the bottom of the dropdown, never scrolling
                out of view. */}
            <div className="overflow-y-auto flex-1">
              {options.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">No options yet</p>}
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 ${o.value === value ? 'bg-amber-50 text-amber-700 font-medium' : 'text-slate-700'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="border-t border-slate-200 p-1.5 shrink-0">
              <button
                type="button"
                onClick={() => { setOpen(false); onAdd(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
              >
                <PlusIcon className="h-4 w-4" /> {addLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function fetchExpenses(status: string, page: number, size: number): Promise<ExpenseListResponse> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (status) params.set('status', status);
  const res = await fetch(`/api/expenses?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}
async function fetchCategories(): Promise<ExpenseCategory[]> {
  const res = await fetch('/api/expenses/categories');
  if (!res.ok) throw new Error('Failed to fetch categories');
  return res.json();
}
async function fetchCurrencies(): Promise<CurrencyOption[]> {
  const res = await fetch('/api/currencies?activeOnly=true');
  if (!res.ok) throw new Error('Failed to fetch currencies');
  return res.json();
}
// Same fetch-leads-for-a-dropdown pattern as InvoiceListPage.tsx's
// fetchLeads — scoped to CONFIRMED leads (i.e. Customers), matching how
// src/app/dashboard/customers/page.tsx defines "Customer".
async function fetchCustomers(): Promise<CustomerOption[]> {
  const res = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc&status=CONFIRMED');
  if (!res.ok) throw new Error('Failed to fetch customers');
  const data = await res.json();
  return data.content;
}
async function fetchCategoryLinks(): Promise<CategoryLink[]> {
  const res = await fetch('/api/expenses/category-links');
  if (!res.ok) throw new Error('Failed to fetch category links');
  const links = await res.json();
  return links.map((l: any) => ({
    id: l.id, categoryId: l.categoryId, categoryName: l.category.name, subCategoryId: l.subCategoryId, subCategoryName: l.subCategory.name,
  }));
}

const blankForm = {
  categoryId: '', subCategoryId: '', vendorLeadId: '', expenseDate: dayjs().format('YYYY-MM-DD'), amount: '', currencyCode: 'INR',
  exchangeRate: '', paymentMethod: '', referenceNumber: '', notes: '', status: 'PENDING',
};

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [showSubCategoryForm, setShowSubCategoryForm] = useState(false);
  const [subCategoryForm, setSubCategoryForm] = useState({ categoryId: '', name: '' });
  const [editingSubCategoryId, setEditingSubCategoryId] = useState<number | null>(null);
  // "+ Add" — a standalone Category/Sub Category link, separate from the
  // Category and Sub Category forms above (which are untouched).
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState({ categoryId: '', subCategoryId: '' });
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);

  // Expense Categories search — same debounced searchInput/search pattern
  // as the Leads/Customer modules, applied client-side (this table has no
  // server-side pagination to re-fetch against, same as Verticals/Packages).
  const [categorySearchInput, setCategorySearchInput] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setCategorySearch(categorySearchInput), 400);
    return () => clearTimeout(t);
  }, [categorySearchInput]);

  const { data, isLoading } = useQuery({ queryKey: ['expenses', statusFilter, page, size], queryFn: () => fetchExpenses(statusFilter, page, size) });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: fetchCategories });
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies });
  const { data: categoryLinks = [] } = useQuery({ queryKey: ['expense-category-links'], queryFn: fetchCategoryLinks });
  const filteredCategoryLinks = categorySearch
    ? categoryLinks.filter((l) => {
        const term = categorySearch.trim().toLowerCase();
        return l.categoryName.toLowerCase().includes(term) || l.subCategoryName.toLowerCase().includes(term);
      })
    : categoryLinks;
  const { data: customers = [] } = useQuery({ queryKey: ['customers-for-expense-vendor'], queryFn: fetchCustomers });

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm); };

  const openEdit = (row: ExpenseRow) => {
    setEditingId(row.id);
    setForm({
      categoryId: String(row.categoryId),
      subCategoryId: row.subCategoryId ? String(row.subCategoryId) : '',
      vendorLeadId: row.vendorLeadId ? String(row.vendorLeadId) : '',
      expenseDate: dayjs(row.expenseDate).format('YYYY-MM-DD'),
      amount: row.amount,
      currencyCode: row.currencyCode,
      exchangeRate: row.currencyCode === 'INR' ? '' : row.exchangeRate,
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber || '',
      notes: row.notes || '',
      status: row.status,
    });
    setShowForm(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/expenses/${editingId}` : '/api/expenses';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save expense'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.success(editingId ? 'Expense updated' : 'Expense recorded'); closeForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PAID' }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to mark paid'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Marked as paid'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete expense'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeCategoryForm = () => { setShowCategoryForm(false); setEditingCategoryId(null); setCategoryForm({ name: '', description: '' }); };
  const openAddCategory = () => { setEditingCategoryId(null); setCategoryForm({ name: '', description: '' }); setShowCategoryForm(true); };
  const openEditCategory = (c: ExpenseCategory) => { setEditingCategoryId(c.id); setCategoryForm({ name: c.name, description: c.description || '' }); setShowCategoryForm(true); };

  // Create (POST) or update (PUT) — same editingId-branches-the-request
  // pattern as every other module's save mutation in this app (see Leads,
  // Invoices, etc).
  const saveCategory = useMutation({
    mutationFn: async () => {
      const url = editingCategoryId ? `/api/expenses/categories/${editingCategoryId}` : '/api/expenses/categories';
      const method = editingCategoryId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(categoryForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save category'); }
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success(editingCategoryId ? 'Category updated' : 'Category created');
      // Newly created categories are auto-selected into the "+ Add" mapping
      // form, since that's the only place this popup is opened from now.
      if (!editingCategoryId) setLinkForm({ categoryId: String(created.id), subCategoryId: '' });
      closeCategoryForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete category'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-categories'] }); toast.success('Category deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDeleteCategory = (c: ExpenseCategory) => {
    if (window.confirm(`Delete category "${c.name}"? This cannot be undone.`)) deleteCategory.mutate(c.id);
  };

  const closeSubCategoryForm = () => { setShowSubCategoryForm(false); setEditingSubCategoryId(null); setSubCategoryForm({ categoryId: '', name: '' }); };
  const openAddSubCategory = () => { setEditingSubCategoryId(null); setSubCategoryForm({ categoryId: '', name: '' }); setShowSubCategoryForm(true); };
  const openEditSubCategory = (s: ExpenseSubCategory) => { setEditingSubCategoryId(s.id); setSubCategoryForm({ categoryId: String(s.categoryId), name: s.name }); setShowSubCategoryForm(true); };

  const saveSubCategory = useMutation({
    mutationFn: async () => {
      const url = editingSubCategoryId ? `/api/expenses/sub-categories/${editingSubCategoryId}` : '/api/expenses/sub-categories';
      const method = editingSubCategoryId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subCategoryForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save sub-category'); }
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success(editingSubCategoryId ? 'Sub-category updated' : 'Sub-category created');
      // Newly created sub-categories are auto-selected into the "+ Add"
      // mapping form (both fields, since a sub-category always belongs to
      // exactly one category, regardless of what was picked in the popup).
      if (!editingSubCategoryId) setLinkForm({ categoryId: String(created.categoryId), subCategoryId: String(created.id) });
      closeSubCategoryForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSubCategory = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/sub-categories/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete sub-category'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-categories'] }); toast.success('Sub-category deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDeleteSubCategory = (s: ExpenseSubCategory) => {
    if (window.confirm(`Delete sub-category "${s.name}"? This cannot be undone.`)) deleteSubCategory.mutate(s.id);
  };

  // Flattened for the standalone Sub Categories table — each row keeps its
  // parent category's name for display, same underlying data as the
  // per-category list embedded in the Categories table.
  const allSubCategories = categories.flatMap((c) => c.subCategories.map((s) => ({ ...s, categoryName: c.name })));

  const selectedCategory = categories.find((c) => c.id === Number(form.categoryId));
  const subCategoryOptions = selectedCategory?.subCategories || [];

  const closeLinkForm = () => { setShowLinkForm(false); setEditingLinkId(null); setLinkForm({ categoryId: '', subCategoryId: '' }); };
  const openAddLink = () => { setEditingLinkId(null); setLinkForm({ categoryId: '', subCategoryId: '' }); setShowLinkForm(true); };
  const openViewOrEditLink = (l: CategoryLink) => { setEditingLinkId(l.id); setLinkForm({ categoryId: String(l.categoryId), subCategoryId: String(l.subCategoryId) }); setShowLinkForm(true); };

  const saveLink = useMutation({
    mutationFn: async () => {
      const url = editingLinkId ? `/api/expenses/category-links/${editingLinkId}` : '/api/expenses/category-links';
      const method = editingLinkId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(linkForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-category-links'] }); toast.success(editingLinkId ? 'Updated' : 'Added'); closeLinkForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expenses/category-links/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-category-links'] }); toast.success('Deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });
  const handleDeleteLink = (l: CategoryLink) => {
    if (window.confirm(`Delete "${l.categoryName} → ${l.subCategoryName}"? This cannot be undone.`)) deleteLink.mutate(l.id);
  };

  const linkSelectedCategory = categories.find((c) => c.id === Number(linkForm.categoryId));
  const linkSubCategoryOptions = linkSelectedCategory?.subCategories || [];

  const expenses = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const pageNumbers = getPageNumbers(page, totalPages || 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Expenses</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Track business/operational spend — rent, vendors, subscriptions, and more</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> New Expense
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.categoryId || !form.amount || !form.expenseDate || !form.paymentMethod) {
              toast.error('Category, amount, date, and payment method are required');
              return;
            }
            if (subCategoryOptions.length > 0 && !form.subCategoryId) {
              toast.error('Sub-category is required');
              return;
            }
            save.mutate();
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingId ? 'Edit Expense' : 'Record Expense'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value, subCategoryId: '' }))} className={inputCls}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sub Category</label>
              <select value={form.subCategoryId} onChange={(e) => setForm((f) => ({ ...f, subCategoryId: e.target.value }))} className={inputCls} disabled={subCategoryOptions.length === 0}>
                <option value="">{subCategoryOptions.length === 0 ? 'No sub-categories' : 'Select sub-category'}</option>
                {subCategoryOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
              <select value={form.vendorLeadId} onChange={(e) => setForm((f) => ({ ...f, vendorLeadId: e.target.value }))} className={inputCls}>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expense Date</label>
              <input type="date" value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <select value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))} className={inputCls}>
                <option value="INR">INR</option>
                {currencies.filter((c) => c.currencyCode !== 'INR').map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode}</option>)}
              </select>
            </div>
            {form.currencyCode !== 'INR' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Exchange Rate (→ INR)</label>
                <input type="number" min="0" step="0.000001" value={form.exchangeRate} onChange={(e) => setForm((f) => ({ ...f, exchangeRate: e.target.value }))} className={inputCls} placeholder="Leave blank to auto-resolve" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))} className={inputCls}>
                <option value="">Select method</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Reference / Bill No.</label>
              <input value={form.referenceNumber} onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputCls}>
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={save.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {save.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Save Expense'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex gap-2">
          {['', 'PENDING', 'PAID'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : expenses.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No expenses recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Expense</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Sub Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, idx) => (
                  <tr key={e.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{e.expenseNumber}</p>
                      <p className="text-xs text-slate-400">{e.vendor || 'No vendor'}{e.referenceNumber ? ` · ${e.referenceNumber}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.categoryName}</td>
                    <td className="px-4 py-3 text-slate-600">{e.subCategoryName || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(e.expenseDate).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(e.amount, e.currencyCode)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status]}`}>{e.status}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {e.status === 'PENDING' && (
                          <button onClick={() => markPaid.mutate(e.id)} className="text-xs font-medium text-green-700 hover:text-green-800">Mark Paid</button>
                        )}
                        <button onClick={() => openEdit(e)} className="text-xs font-medium text-slate-500 hover:text-slate-800">Edit</button>
                        <button
                          onClick={() => { if (window.confirm(`Delete expense ${e.expenseNumber}?`)) remove.mutate(e.id); }}
                          className="text-xs font-medium text-slate-500 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {expenses.length > 0 && (
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
                onClick={() => setPage((p) => Math.max(0, p - 1))}
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
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
          </div>
        )}
      </div>

      {/* Expense Categories — only the Category/Sub Category mapping table
          is shown ("+ Add" below). The existing Category and Sub Category
          forms are unchanged and only ever reachable as popups from inside
          the mapping form's dropdowns; they never render a table of their
          own here. Editing/deleting an individual Sub Category directly
          (outside of a mapping) still has no entry point — intentionally
          left for a follow-up; the underlying handlers/mutations remain in
          place, just unused by this JSX. */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Expense Categories</h2>
          <button
            onClick={openAddLink}
            className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
          >
            <PlusIcon className="h-4 w-4" /> Add
          </button>
        </div>

        {/* Search — same bordered-card layout, icon, and clear button as
            the Leads/Customer modules; filters by Category and Sub Category
            name. */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by category, sub category..."
              value={categorySearchInput}
              onChange={(e) => setCategorySearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {categorySearchInput && (
              <button onClick={() => { setCategorySearchInput(''); setCategorySearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {showLinkForm && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (!linkForm.categoryId || !linkForm.subCategoryId) { toast.error('Category and Sub Category are required'); return; } saveLink.mutate(); }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 grid grid-cols-2 gap-3"
          >
            <AddableSelect
              value={linkForm.categoryId}
              onChange={(v) => setLinkForm({ categoryId: v, subCategoryId: '' })}
              options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
              placeholder="Select category"
              onAdd={openAddCategory}
              addLabel="Add Category"
            />
            <AddableSelect
              value={linkForm.subCategoryId}
              onChange={(v) => setLinkForm((f) => ({ ...f, subCategoryId: v }))}
              options={linkSubCategoryOptions.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder={linkForm.categoryId ? 'Select sub-category' : 'Select a category first'}
              onAdd={openAddSubCategory}
              addLabel="Add Sub Category"
              disabled={!linkForm.categoryId}
            />
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={closeLinkForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={saveLink.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveLink.isPending ? 'Saving...' : editingLinkId ? 'Save Changes' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {/* Existing Category form, unchanged — now only opened as a popup
            from the "+ Add Category" option above. */}
        {showCategoryForm && (
          <Modal title={editingCategoryId ? 'Edit Category' : 'Add Category'} onClose={closeCategoryForm}>
            <form
              onSubmit={(e) => { e.preventDefault(); if (!categoryForm.name) { toast.error('Name is required'); return; } saveCategory.mutate(); }}
              className="grid grid-cols-2 gap-3"
            >
              <input placeholder="Name" value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
              <input placeholder="Description (optional)" value={categoryForm.description} onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
              <div className="col-span-2 flex justify-end gap-2">
                <button type="button" onClick={closeCategoryForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" disabled={saveCategory.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {saveCategory.isPending ? 'Saving...' : editingCategoryId ? 'Save Changes' : 'Add'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Existing Sub Category form, unchanged — now only opened as a
            popup from the "+ Add Sub Category" option above. */}
        {showSubCategoryForm && (
          <Modal title={editingSubCategoryId ? 'Edit Sub Category' : 'Add Sub Category'} onClose={closeSubCategoryForm}>
            <form
              onSubmit={(e) => { e.preventDefault(); if (!subCategoryForm.categoryId || !subCategoryForm.name) { toast.error('Category and name are required'); return; } saveSubCategory.mutate(); }}
              className="grid grid-cols-2 gap-3"
            >
              <select
                value={subCategoryForm.categoryId}
                onChange={(e) => setSubCategoryForm((f) => ({ ...f, categoryId: e.target.value }))}
                disabled={!!editingSubCategoryId}
                className={`${inputCls} ${editingSubCategoryId ? 'bg-slate-100 text-slate-500' : ''}`}
              >
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder="Sub-category name" value={subCategoryForm.name} onChange={(e) => setSubCategoryForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
              <div className="col-span-2 flex justify-end gap-2">
                <button type="button" onClick={closeSubCategoryForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" disabled={saveSubCategory.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {saveSubCategory.isPending ? 'Saving...' : editingSubCategoryId ? 'Save Changes' : 'Add'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* The only table on this page now — each row is a Category + Sub
            Category pairing created via "+ Add". */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {categoryLinks.length === 0 ? (
            <p className="text-center py-16 text-slate-400">No Category / Sub Category mappings yet</p>
          ) : filteredCategoryLinks.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-lg font-medium text-slate-600">No categories found</p>
              <p className="text-sm text-slate-400 mt-1">Try adjusting your search</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-white">Category</th>
                    <th className="px-4 py-3 text-left font-semibold text-white">Sub Category</th>
                    <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategoryLinks.map((l, idx) => (
                    <tr key={l.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3 text-slate-600">{l.categoryName}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{l.subCategoryName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openViewOrEditLink(l)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="View">
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => openViewOrEditLink(l)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDeleteLink(l)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
