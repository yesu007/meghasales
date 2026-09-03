'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PencilIcon, TrashIcon, ChartPieIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/currency';

interface Category { id: number; name: string; code: string }
interface ResourceRow {
  id: number;
  resourceType: string;
  name: string;
  maxSalary: number | null;
  incrementProvision: number | null;
  salaryAfterIncrement: number;
  remark: string | null;
  splits: Record<string, number>;
  totalAllocationPct: number;
  check: 'OK' | 'SHARED' | 'MISMATCH';
}
interface Weightage { categoryId: number; name: string; code: string; allocatedAmount: number; weightagePct: number }
interface MatrixResponse {
  categories: Category[];
  resources: ResourceRow[];
  totals: { maxSalary: number; incrementProvision: number; salaryAfterIncrement: number };
  weightage: Weightage[];
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchMatrix(): Promise<MatrixResponse> {
  const res = await fetch('/api/salary-resources');
  if (!res.ok) throw new Error('Failed to fetch salary allocation');
  return res.json();
}

function checkBadge(check: ResourceRow['check']) {
  const styles: Record<ResourceRow['check'], string> = {
    OK: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    SHARED: 'bg-slate-100 border-slate-200 text-slate-600',
    MISMATCH: 'bg-amber-50 border-amber-200 text-amber-800',
  };
  const labels: Record<ResourceRow['check'], string> = { OK: 'OK', SHARED: 'Shared', MISMATCH: 'Check %' };
  return <span className={`text-xs font-medium rounded-full px-2 py-0.5 border whitespace-nowrap ${styles[check]}`}>{labels[check]}</span>;
}

function blankForm(categories: Category[]) {
  return {
    resourceType: '',
    name: '',
    maxSalary: '',
    incrementProvision: '',
    remark: '',
    splits: Object.fromEntries(categories.map((c) => [c.code, ''])) as Record<string, string>,
  };
}

export default function SalaryAllocationPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [form, setForm] = useState<ReturnType<typeof blankForm>>({ resourceType: '', name: '', maxSalary: '', incrementProvision: '', remark: '', splits: {} });

  const { data, isLoading, isError } = useQuery({ queryKey: ['salary-allocation'], queryFn: fetchMatrix });
  const categories = data?.categories ?? [];
  const resources = data?.resources ?? [];

  const resourceTypes = useMemo(() => Array.from(new Set(resources.map((r) => r.resourceType))), [resources]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['salary-allocation'] });

  const openNew = () => { setEditing(null); setForm(blankForm(categories)); setShowForm(true); };
  const openEdit = (row: ResourceRow) => {
    setEditing(row);
    setForm({
      resourceType: row.resourceType,
      name: row.name,
      maxSalary: row.maxSalary === null ? '' : String(row.maxSalary),
      incrementProvision: row.incrementProvision === null ? '' : String(row.incrementProvision),
      remark: row.remark || '',
      splits: Object.fromEntries(categories.map((c) => [c.code, row.splits[c.code] ? String(row.splits[c.code]) : ''])),
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const formTotalPct = useMemo(
    () => Object.values(form.splits).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [form.splits]
  );

  const splitsPayload = () =>
    categories
      .map((c) => ({ categoryId: c.id, percentage: Number(form.splits[c.code] || 0) }))
      .filter((s) => s.percentage > 0);

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/salary-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: form.resourceType, name: form.name,
          maxSalary: form.maxSalary || null, incrementProvision: form.incrementProvision || null,
          remark: form.remark || null, splits: splitsPayload(),
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to add resource'); }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success('Resource added'); closeForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('Nothing selected');
      const res = await fetch(`/api/salary-resources/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: form.resourceType, name: form.name,
          maxSalary: form.maxSalary || null, incrementProvision: form.incrementProvision || null,
          remark: form.remark || null, splits: splitsPayload(),
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update resource'); }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success('Resource updated'); closeForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/salary-resources/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to remove resource'); }
    },
    onSuccess: () => { invalidate(); toast.success('Resource removed'); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Salary Allocation</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Team salary cost split by percentage across each business line</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : openNew())}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> Add Resource
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); editing ? update.mutate() : create.mutate(); }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editing ? `Edit — ${editing.name}` : 'Add Resource'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Resource Type <span className="text-red-500">*</span></label>
              <input list="resource-types" value={form.resourceType} onChange={(e) => setForm((f) => ({ ...f, resourceType: e.target.value }))} required className={inputCls} />
              <datalist id="resource-types">{resourceTypes.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee / Resource <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Maximum Salary (₹)</label>
              <input type="number" min="0" step="0.01" value={form.maxSalary} onChange={(e) => setForm((f) => ({ ...f, maxSalary: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Increment Provision (₹)</label>
              <input type="number" min="0" step="0.01" value={form.incrementProvision} onChange={(e) => setForm((f) => ({ ...f, incrementProvision: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Remark</label>
              <input value={form.remark} onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))} className={inputCls} />
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">Allocation %</label>
              <span className={`text-xs font-medium rounded-full px-2 py-0.5 border ${
                Math.abs(formTotalPct - 100) < 0.01 ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : Math.abs(formTotalPct) < 0.01 ? 'bg-slate-100 border-slate-200 text-slate-600'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                Total {formTotalPct.toFixed(1)}%
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-slate-200 rounded-lg p-3">
              {categories.map((c) => (
                <div key={c.id}>
                  <label htmlFor={`split-${c.id}`} className="block text-xs text-slate-500 mb-1">{c.name}</label>
                  <input
                    id={`split-${c.id}`} type="number" min="0" max="100" step="0.1"
                    placeholder="0.0"
                    value={form.splits[c.code] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, splits: { ...f.splits, [c.code]: e.target.value } }))}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-800 text-right focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={create.isPending || update.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {editing ? (update.isPending ? 'Saving...' : 'Save Changes') : (create.isPending ? 'Adding...' : 'Add Resource')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the salary allocation matrix.</p>
        ) : resources.length === 0 ? (
          <div className="text-center py-16">
            <ChartPieIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No resources yet</p>
            <p className="text-sm text-slate-400 mt-1">Add the first one with the button above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="sticky left-0 bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">Resource Type</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">Employee / Resource</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">Max Salary</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">Increment</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">After Increment</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">Remark</th>
                  {categories.map((c) => (
                    <th key={c.id} className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">{c.name}</th>
                  ))}
                  <th className="text-right text-xs font-semibold text-slate-700 uppercase tracking-wide py-2 px-3">Total %</th>
                  <th className="text-center text-xs font-semibold text-slate-700 uppercase tracking-wide py-2 px-3">Check</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((r, idx) => {
                  const groupStart = idx === 0 || resources[idx - 1].resourceType !== r.resourceType;
                  return (
                    <tr key={r.id} className={`border-b border-slate-100 hover:bg-amber-50/40 ${groupStart ? 'border-t-2 border-t-slate-200' : ''}`}>
                      <td className="sticky left-0 bg-white py-2 px-3 text-slate-700 whitespace-nowrap">{r.resourceType}</td>
                      <td className="py-2 px-3 text-slate-800 font-medium whitespace-nowrap">{r.name}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">{r.maxSalary === null ? '—' : formatCurrency(r.maxSalary, 'INR')}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-700">{r.incrementProvision === null ? '—' : formatCurrency(r.incrementProvision, 'INR')}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium text-slate-800">{formatCurrency(r.salaryAfterIncrement, 'INR')}</td>
                      <td className="py-2 px-3 text-slate-500 max-w-[220px] truncate" title={r.remark || ''}>{r.remark || '—'}</td>
                      {categories.map((c) => (
                        <td key={c.id} className="py-2 px-3 text-right tabular-nums text-slate-700">
                          {r.splits[c.code] ? `${Number(r.splits[c.code]).toFixed(1)}%` : '—'}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-800">{r.totalAllocationPct.toFixed(1)}%</td>
                      <td className="py-2 px-3 text-center">{checkBadge(r.check)}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-amber-600" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                          <button
                            onClick={() => { if (window.confirm(`Remove ${r.name} from the allocation matrix?`)) remove.mutate(r.id); }}
                            className="text-slate-400 hover:text-red-600" title="Remove"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
                  <td className="sticky left-0 bg-slate-50 py-2.5 px-3" colSpan={2}>Total Employee Salary</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(data!.totals.maxSalary, 'INR')}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(data!.totals.incrementProvision, 'INR')}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{formatCurrency(data!.totals.salaryAfterIncrement, 'INR')}</td>
                  <td colSpan={2 + categories.length + 3} />
                </tr>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-amber-700">
                  <td className="sticky left-0 bg-slate-50 py-2.5 px-3" colSpan={6}>Salary Weightage for Shared Cost Allocation</td>
                  {categories.map((c) => {
                    const w = data!.weightage.find((x) => x.categoryId === c.id);
                    return <td key={c.id} className="py-2.5 px-3 text-right tabular-nums">{(w?.weightagePct ?? 0).toFixed(1)}%</td>;
                  })}
                  <td className="py-2.5 px-3 text-right tabular-nums">
                    {data!.weightage.reduce((s, w) => s + w.weightagePct, 0).toFixed(1)}%
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
