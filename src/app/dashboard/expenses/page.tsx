'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';

interface ExpenseCategory { id: number; name: string; description: string | null; isActive: boolean }
interface CurrencyOption { currencyCode: string }
interface ExpenseRow {
  id: number;
  expenseNumber: string;
  categoryId: number;
  categoryName: string;
  vendor: string | null;
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

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
};
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'UPI', 'OTHER'];
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchExpenses(status: string, page: number): Promise<ExpenseListResponse> {
  const params = new URLSearchParams({ page: String(page), size: '15' });
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

const blankForm = {
  categoryId: '', vendor: '', expenseDate: dayjs().format('YYYY-MM-DD'), amount: '', currencyCode: 'INR',
  exchangeRate: '', paymentMethod: '', referenceNumber: '', notes: '', status: 'PENDING',
};

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });

  const { data, isLoading } = useQuery({ queryKey: ['expenses', statusFilter, page], queryFn: () => fetchExpenses(statusFilter, page) });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: fetchCategories });
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies });

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm); };

  const openEdit = (row: ExpenseRow) => {
    setEditingId(row.id);
    setForm({
      categoryId: String(row.categoryId),
      vendor: row.vendor || '',
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

  const createCategory = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/expenses/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(categoryForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create category'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-categories'] }); toast.success('Category created'); setShowCategoryForm(false); setCategoryForm({ name: '', description: '' }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const expenses = data?.content || [];

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
            save.mutate();
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingId ? 'Edit Expense' : 'Record Expense'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} className={inputCls}>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vendor</label>
              <input value={form.vendor} onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))} className={inputCls} placeholder="e.g. ACME Office Supplies" />
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
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Expense</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{e.expenseNumber}</p>
                      <p className="text-xs text-slate-400">{e.vendor || 'No vendor'}{e.referenceNumber ? ` · ${e.referenceNumber}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.categoryName}</td>
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

        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
            <span>Page {data.page + 1} of {data.totalPages} · {data.totalElements} total</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Prev</button>
              <button disabled={page + 1 >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">Next</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Expense Categories</h2>
          <button onClick={() => setShowCategoryForm((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <PlusIcon className="h-4 w-4" /> Add Category
          </button>
        </div>
        {showCategoryForm && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (!categoryForm.name) { toast.error('Name is required'); return; } createCategory.mutate(); }}
            className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
          >
            <input placeholder="Name" value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            <input placeholder="Description (optional)" value={categoryForm.description} onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCategoryForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={createCategory.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">Add</button>
            </div>
          </form>
        )}
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr><th className="py-1.5 pr-4">Name</th><th className="py-1.5">Description</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="py-2 pr-4 text-slate-800">{c.name}</td>
                <td className="py-2 text-slate-600">{c.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
