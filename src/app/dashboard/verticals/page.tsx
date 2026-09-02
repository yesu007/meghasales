'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';
import BudgetVsActualChart, { ActualExpenseBreakdownEntry } from '@/components/verticals/BudgetVsActualChart';

interface UserOption { id: number; firstName: string; lastName: string }
interface CurrencyOption { currencyCode: string }
interface VerticalRow {
  id: number;
  name: string;
  code: string;
  headId: number | null;
  headName: string | null;
  budget: string | null;
  budgetCurrencyCode: string | null;
  isActive: boolean;
  // Present only when the /api/verticals?includeActuals=true request below
  // succeeds and the session can view Expense Budgets — see that route's
  // GET handler. Absent (rather than defaulted here) so a permission gap
  // is distinguishable from "genuinely zero spend" if this ever needs it;
  // every read below defaults to 0/[] regardless.
  actualExpenses?: number;
  actualExpenseBreakdown?: ActualExpenseBreakdownEntry[];
  // Annual Budget shown in the table's "Budget" column — Expense Budgets'
  // Monthly Budget × 12 for this vertical, computed server-side. null (not
  // 0/absent) when the caller can't view Expense Budgets, distinguishing
  // "no permission" from "genuinely zero budget configured".
  annualBudget?: number | null;
  annualBudgetCurrencyCode?: string | null;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchVerticals(): Promise<VerticalRow[]> {
  const res = await fetch('/api/verticals?includeInactive=true&includeActuals=true');
  if (!res.ok) throw new Error('Failed to fetch verticals');
  return res.json();
}
async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.content;
}
async function fetchCurrencies(): Promise<CurrencyOption[]> {
  const res = await fetch('/api/currencies?activeOnly=true');
  if (!res.ok) throw new Error('Failed to fetch currencies');
  return res.json();
}

const blankForm = { name: '', headId: '', budget: '', budgetCurrencyCode: 'INR' };

export default function VerticalsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm);

  // Search — same debounced searchInput/search pattern as the Leads module
  // (src/app/dashboard/leads/page.tsx), but applied client-side since this
  // list has no server-side pagination to re-fetch against.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: verticals = [], isLoading, isError } = useQuery({ queryKey: ['verticals-admin'], queryFn: fetchVerticals });
  const filteredVerticals = search
    ? verticals.filter((v) => {
        const term = search.trim().toLowerCase();
        return v.name.toLowerCase().includes(term) || v.code.toLowerCase().includes(term) || (v.headName || '').toLowerCase().includes(term);
      })
    : verticals;
  const { data: users = [] } = useQuery({ queryKey: ['users-for-vertical-head'], queryFn: fetchUsers });
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies });

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm); };

  const openEdit = (v: VerticalRow) => {
    setEditingId(v.id);
    setForm({
      name: v.name,
      headId: v.headId ? String(v.headId) : '',
      budget: v.budget || '',
      budgetCurrencyCode: v.budgetCurrencyCode || 'INR',
    });
    setShowForm(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/verticals/${editingId}` : '/api/verticals';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, headId: form.headId || null, budget: form.budget || null }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save vertical'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['verticals-admin'] }); queryClient.invalidateQueries({ queryKey: ['verticals'] }); toast.success(editingId ? 'Vertical updated' : 'Vertical created'); closeForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = isActive
        ? await fetch(`/api/verticals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) })
        : await fetch(`/api/verticals/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update vertical'); }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['verticals-admin'] });
      queryClient.invalidateQueries({ queryKey: ['verticals'] });
      toast.success(variables.isActive ? 'Vertical reactivated' : 'Vertical deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Verticals</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">The business verticals every budget, project and future report groups by</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> New Vertical
        </button>
      </div>

      {/* Search — same bordered-card placement above the table as Leads. */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by vertical, code, head..."
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
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) { toast.error('Vertical name is required'); return; } save.mutate(); }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingId ? 'Edit Vertical' : 'New Vertical'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Vertical Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Jewellery Manufacturing" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Vertical Head</label>
              <select value={form.headId} onChange={(e) => setForm((f) => ({ ...f, headId: e.target.value }))} className={inputCls}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Budget</label>
              <input type="number" min="0" step="0.01" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} className={inputCls} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
              <select value={form.budgetCurrencyCode} onChange={(e) => setForm((f) => ({ ...f, budgetCurrencyCode: e.target.value }))} className={inputCls}>
                <option value="INR">INR</option>
                {currencies.filter((c) => c.currencyCode !== 'INR').map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={save.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {save.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create Vertical'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : isError ? (
          <p className="text-center py-16 text-red-500">Failed to load verticals. Please try refreshing the page.</p>
        ) : verticals.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No verticals created yet</p>
        ) : filteredVerticals.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-medium text-slate-600">No verticals found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Vertical</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Head</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Budget</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Actual Expenses</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Budget Usage</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredVerticals.map((v, idx) => {
                  // "Budget" column — dynamically computed from Expense
                  // Budgets (Monthly Budget × 12 for this vertical, current
                  // financial year; see GET /api/verticals's annualBudget),
                  // NOT the legacy manually-typed Vertical.budget figure
                  // (that field still exists — see openEdit/save and the
                  // Budget input above — but no longer drives this column).
                  const displayBudgetCurrency = v.annualBudgetCurrencyCode || v.budgetCurrencyCode || 'INR';
                  const displayBudgetNum = v.annualBudget ?? null;

                  // Actual Expenses / Budget Usage / variance below are
                  // unrelated to the Budget column change above — kept
                  // exactly as before, still measured against the legacy
                  // Vertical.budget figure, so that column's meaning is
                  // unaffected.
                  const budgetCurrency = v.budgetCurrencyCode || 'INR';
                  const budgetNum = v.budget != null ? Number(v.budget) : null;
                  const actualExpenses = v.actualExpenses ?? 0;
                  const variance = budgetNum != null && budgetNum > 0 ? actualExpenses - budgetNum : null;
                  const utilizationPercent = budgetNum != null && budgetNum > 0 ? (actualExpenses / budgetNum) * 100 : null;
                  const isOverBudget = variance !== null && variance > 0;
                  return (
                    <tr key={v.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{v.name}</p>
                        <p className="text-xs text-slate-400">{v.code}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{v.headName || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{displayBudgetNum != null ? formatCurrency(displayBudgetNum, displayBudgetCurrency) : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-slate-700">{formatCurrency(actualExpenses, budgetCurrency)}</p>
                        {variance !== null && (
                          <p className={`text-xs mt-0.5 ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {variance > 0
                              ? `▲ ${formatCurrency(variance, budgetCurrency)} over budget`
                              : `${formatCurrency(Math.abs(variance), budgetCurrency)} remaining`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {utilizationPercent !== null ? (
                          <div
                            className="w-28"
                            title={`Budget: ${formatCurrency(budgetNum!, budgetCurrency)}\nActual: ${formatCurrency(actualExpenses, budgetCurrency)}\nRemaining: ${formatCurrency(Math.max(budgetNum! - actualExpenses, 0), budgetCurrency)}\nUsage: ${utilizationPercent.toFixed(1)}%`}
                          >
                            <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${isOverBudget ? 'bg-red-600' : 'bg-amber-600'}`}
                                style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                              />
                            </div>
                            <p className={`text-[11px] mt-0.5 ${isOverBudget ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                              {isOverBudget ? `${utilizationPercent.toFixed(1)}% — Over Budget` : `${utilizationPercent.toFixed(1)}%`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${v.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {v.isActive ? 'Active' : 'Deleted'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(v)} className="text-xs font-medium text-slate-500 hover:text-slate-800">Edit</button>
                          {v.isActive ? (
                            <button
                              onClick={() => { if (window.confirm(`Delete vertical "${v.name}"?`)) toggleActive.mutate({ id: v.id, isActive: false }); }}
                              className="text-xs font-medium text-slate-500 hover:text-red-600"
                            >
                              Delete
                            </button>
                          ) : (
                            <button onClick={() => toggleActive.mutate({ id: v.id, isActive: true })} className="text-xs font-medium text-green-700 hover:text-green-800">
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && !isError && verticals.length > 0 && (
        <BudgetVsActualChart
          verticals={verticals.map((v) => ({
            id: v.id,
            name: v.name,
            budget: v.budget,
            budgetCurrencyCode: v.budgetCurrencyCode,
            actualExpenses: v.actualExpenses ?? 0,
            actualExpenseBreakdown: v.actualExpenseBreakdown ?? [],
          }))}
        />
      )}
    </div>
  );
}
