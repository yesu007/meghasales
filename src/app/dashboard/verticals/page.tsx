'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';

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
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchVerticals(): Promise<VerticalRow[]> {
  const res = await fetch('/api/verticals');
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

  const { data: verticals = [], isLoading } = useQuery({ queryKey: ['verticals-admin'], queryFn: fetchVerticals });
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

  // A vertical still assigned to an expense budget (or, in future, a
  // client/project once those get their own verticalId) comes back as a
  // 409 with an explanatory message — surfaced as-is via toast.error rather
  // than a generic "failed to delete", since the whole point is telling the
  // user exactly what it's assigned to.
  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/verticals/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete vertical'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verticals-admin'] });
      queryClient.invalidateQueries({ queryKey: ['verticals'] });
      toast.success('Vertical deleted');
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
        ) : verticals.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No verticals created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Vertical</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Head</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Budget</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {verticals.map((v, idx) => (
                  <tr key={v.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{v.name}</p>
                      <p className="text-xs text-slate-400">{v.code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{v.headName || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{v.budget ? formatCurrency(v.budget, v.budgetCurrencyCode || 'INR') : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(v)} className="text-xs font-medium text-slate-500 hover:text-slate-800">Edit</button>
                        <button
                          onClick={() => { if (window.confirm(`Delete vertical "${v.name}"? This can't be undone.`)) remove.mutate(v.id); }}
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
      </div>
    </div>
  );
}
