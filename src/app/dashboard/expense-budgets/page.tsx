'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';
import { defaultMonthlySpread } from '@/lib/expenseBudgetVariance';

interface Vertical { id: number; name: string }
interface ExpenseCategory { id: number; name: string }
interface CurrencyOption { currencyCode: string }
interface BudgetRow {
  id: number;
  financialYearStart: string;
  financialYearEnd: string;
  verticalId: number | null;
  verticalName: string;
  categoryId: number;
  categoryName: string;
  totalAmount: string;
  currencyCode: string;
  status: string;
  createdByName: string | null;
}
interface BudgetListResponse { content: BudgetRow[]; page: number; totalPages: number; totalElements: number }

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  APPROVED: 'bg-green-100 text-green-700',
};
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
  if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
  return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
}

async function fetchBudgets(status: string, page: number, size: number): Promise<BudgetListResponse> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (status) params.set('status', status);
  const res = await fetch(`/api/expense-budgets?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch expense budgets');
  return res.json();
}
async function fetchVerticals(): Promise<Vertical[]> {
  const res = await fetch('/api/verticals');
  if (!res.ok) throw new Error('Failed to fetch verticals');
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

const thisFinancialYearStart = () => {
  const now = dayjs();
  // Aligns with the FY convention already used elsewhere in this app
  // (see 6. Expense Budget Management: "01-Aug-2026 to 31-Jul-2027").
  const startYear = now.month() >= 7 ? now.year() : now.year() - 1;
  return dayjs(new Date(startYear, 7, 1));
};

const blankForm = () => {
  const start = thisFinancialYearStart();
  return {
    financialYearStart: start.format('YYYY-MM-DD'),
    financialYearEnd: start.add(1, 'year').subtract(1, 'day').format('YYYY-MM-DD'),
    verticalId: '',
    currencyCode: 'INR',
    notes: '',
  };
};

export default function ExpenseBudgetsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [categoryAmounts, setCategoryAmounts] = useState<Record<number, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ['expense-budgets', statusFilter, page, size], queryFn: () => fetchBudgets(statusFilter, page, size) });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticals });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: fetchCategories });
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies });

  const closeForm = () => { setShowForm(false); setForm(blankForm()); setCategoryAmounts({}); };

  const deleteBudget = async (id: number, categoryName: string) => {
    if (!window.confirm(`Delete the expense budget for "${categoryName}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/expense-budgets/${id}`, { method: 'DELETE' });
    if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.message || 'Failed to delete budget'); return; }
    queryClient.invalidateQueries({ queryKey: ['expense-budgets'] });
    toast.success('Expense budget deleted');
  };

  const setCategoryAmount = (categoryId: number, value: string) =>
    setCategoryAmounts((prev) => ({ ...prev, [categoryId]: value }));

  const categoryEntries = useMemo(
    () => Object.entries(categoryAmounts)
      .map(([categoryId, amount]) => ({ categoryId: Number(categoryId), amount: Number(amount) }))
      .filter((e) => e.amount > 0),
    [categoryAmounts]
  );

  const save = useMutation({
    mutationFn: async () => {
      // Same financial year / vertical / currency, one Expense Budget per
      // category with an amount entered — the backend keys a budget on
      // (FY, vertical, category), so each row becomes its own budget with
      // its own monthly spread.
      const results = await Promise.allSettled(
        categoryEntries.map(async ({ categoryId, amount }) => {
          const months = defaultMonthlySpread(amount, form.financialYearStart, form.financialYearEnd);
          const res = await fetch('/api/expense-budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, categoryId, totalAmount: amount, verticalId: form.verticalId || null, months }),
          });
          if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save budget'); }
          return res.json();
        })
      );
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      return { succeeded: results.length - failures.length, failures };
    },
    onSuccess: ({ succeeded, failures }) => {
      queryClient.invalidateQueries({ queryKey: ['expense-budgets'] });
      if (succeeded > 0) toast.success(`${succeeded} expense budget${succeeded > 1 ? 's' : ''} created`);
      failures.forEach((f) => toast.error(f.reason instanceof Error ? f.reason.message : 'Failed to create a budget'));
      if (failures.length === 0) closeForm();
    },
  });

  const budgets = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const pageNumbers = getPageNumbers(page, totalPages || 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Expense Budgets</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Plan annual, vertical-wise budgets and track them against actual spend</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> New Budget
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (categoryEntries.length === 0 || !form.financialYearStart || !form.financialYearEnd) {
              toast.error('Financial year and a budget amount for at least one category are required');
              return;
            }
            save.mutate();
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">Create Expense Budget</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Financial Year Start</label>
              <input type="date" value={form.financialYearStart} onChange={(e) => setForm((f) => ({ ...f, financialYearStart: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Financial Year End</label>
              <input type="date" value={form.financialYearEnd} onChange={(e) => setForm((f) => ({ ...f, financialYearEnd: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vertical</label>
              <select value={form.verticalId} onChange={(e) => setForm((f) => ({ ...f, verticalId: e.target.value }))} className={inputCls}>
                <option value="">Company-wide</option>
                {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <select value={form.currencyCode} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))} className={inputCls}>
                <option value="INR">INR</option>
                {currencies.filter((c) => c.currencyCode !== 'INR').map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">Category Budgets <span className="text-red-500">*</span></label>
            <p className="text-xs text-slate-400 mb-2">Enter a budget amount for each category that needs one this financial year. Leave the rest blank.</p>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">Categories ({categories.length})</p>
                {categoryEntries.length > 0 && <p className="text-xs font-medium text-amber-700">{categoryEntries.length} with an amount entered</p>}
              </div>
              {categories.length === 0 ? (
                <p className="text-sm text-slate-400 px-3 py-6 text-center">No expense categories found</p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {categories.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                      <label htmlFor={`category-amount-${c.id}`} className="flex-1 text-sm text-slate-700">{c.name}</label>
                      <input
                        id={`category-amount-${c.id}`}
                        type="number" min="0" step="0.01"
                        placeholder="0.00"
                        value={categoryAmounts[c.id] ?? ''}
                        onChange={(e) => setCategoryAmount(c.id, e.target.value)}
                        className="w-36 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-800 text-right focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={save.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {save.isPending ? 'Saving...' : categoryEntries.length > 1 ? `Save Budgets (${categoryEntries.length})` : 'Save Budget'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex gap-2">
          {['', 'DRAFT', 'APPROVED'].map((s) => (
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
        ) : budgets.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No expense budgets created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Financial Year</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Vertical</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Category</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Total Budget</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b, idx) => (
                  <tr key={b.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3 text-slate-700">{dayjs(b.financialYearStart).format('DD MMM YYYY')} – {dayjs(b.financialYearEnd).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-slate-600">{b.verticalName}</td>
                    <td className="px-4 py-3 text-slate-600">{b.categoryName}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(b.totalAmount, b.currencyCode)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status}</span></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/dashboard/expense-budgets/${b.id}`} className="text-xs font-medium text-amber-700 hover:text-amber-800">View</Link>
                        {b.status !== 'APPROVED' && (
                          <button
                            onClick={() => deleteBudget(b.id, b.categoryName)}
                            className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {budgets.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className="px-2 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500">
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent">
                <ChevronLeftIcon className="h-4 w-4" /> Previous
              </button>
              {pageNumbers.map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p)} className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === page ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {p + 1}
                  </button>
                )
              )}
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent">
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
          </div>
        )}
      </div>
    </div>
  );
}
