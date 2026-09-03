'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PencilIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon, ChartPieIcon } from '@heroicons/react/24/outline';
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
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

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

function cellKey(resourceId: number, categoryId: number) {
  return `${resourceId}|${categoryId}`;
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

// Page numbers with ellipsis — same helper as Expense Budgets' matrix.
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
  if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
  return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
}

interface TypeRow { key: string; resourceType: string; count: number; salaryAfterIncrement: number; amounts: Record<string, number> }

export default function SalaryAllocationPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [form, setForm] = useState<ReturnType<typeof blankForm>>({ resourceType: '', name: '', maxSalary: '', incrementProvision: '', remark: '', splits: {} });

  // By Resource: one editable row per person, categories as columns.
  // By Resource Type: a read-only rollup (categories aren't addressable at
  // this grain — a "Developers" row isn't one record with its own splits,
  // it's several, so its cells show allocated ₹, not an editable %).
  const [rowAxis, setRowAxis] = useState<'resource' | 'type'>('resource');
  const [editingCell, setEditingCell] = useState<{ key: string; value: string } | null>(null);

  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const [rowPage, setRowPage] = useState(0);
  const [rowPageSize, setRowPageSize] = useState(10);

  const { data, isLoading, isError } = useQuery({ queryKey: ['salary-allocation'], queryFn: fetchMatrix });
  const categories = data?.categories ?? [];
  const resources = data?.resources ?? [];
  const resourceTypes = useMemo(() => Array.from(new Set(resources.map((r) => r.resourceType))), [resources]);

  const typeRows = useMemo<TypeRow[]>(() => {
    const map = new Map<string, TypeRow>();
    for (const r of resources) {
      if (!map.has(r.resourceType)) map.set(r.resourceType, { key: r.resourceType, resourceType: r.resourceType, count: 0, salaryAfterIncrement: 0, amounts: {} });
      const agg = map.get(r.resourceType)!;
      agg.count += 1;
      agg.salaryAfterIncrement += r.salaryAfterIncrement;
      for (const c of categories) {
        const pct = r.splits[c.code] || 0;
        agg.amounts[c.code] = (agg.amounts[c.code] || 0) + r.salaryAfterIncrement * (pct / 100);
      }
    }
    return Array.from(map.values());
  }, [resources, categories]);

  const rowItems = rowAxis === 'resource' ? resources : typeRows;
  const rowTotalPages = Math.max(1, Math.ceil(rowItems.length / rowPageSize));
  const safeRowPage = Math.min(rowPage, rowTotalPages - 1);
  const pagedRows = useMemo(
    () => rowItems.slice(safeRowPage * rowPageSize, safeRowPage * rowPageSize + rowPageSize),
    [rowItems, safeRowPage, rowPageSize]
  );

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
    categories.map((c) => ({ categoryId: c.id, percentage: Number(form.splits[c.code] || 0) })).filter((s) => s.percentage > 0);

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

  // Identity-only edit (Resource Type / Name / Salary / Remark) — allocation
  // % itself is edited straight in the matrix cell, not through this form.
  const update = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('Nothing selected');
      const res = await fetch(`/api/salary-resources/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceType: form.resourceType, name: form.name,
          maxSalary: form.maxSalary || null, incrementProvision: form.incrementProvision || null,
          remark: form.remark || null,
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

  const updateCell = useMutation({
    mutationFn: async ({ id, splits }: { id: number; splits: { categoryId: number; percentage: number }[] }) => {
      const res = await fetch(`/api/salary-resources/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ splits }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update allocation'); }
      return res.json();
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error(err.message),
  });

  const commitCell = (resource: ResourceRow, category: Category) => {
    const key = cellKey(resource.id, category.id);
    if (editingCell?.key !== key) return;
    const raw = editingCell.value.trim();
    setEditingCell(null);
    const newPct = raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(newPct) || newPct < 0 || newPct > 100) { toast.error('Enter a percentage between 0 and 100'); return; }
    const currentPct = resource.splits[category.code] || 0;
    if (newPct === currentPct) return;
    const mergedSplits = categories.map((c) => ({ categoryId: c.id, percentage: c.id === category.id ? newPct : (resource.splits[c.code] || 0) }));
    updateCell.mutate({ id: resource.id, splits: mergedSplits });
  };

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

          {!editing && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">Allocation % <span className="font-normal text-slate-400">(fine-tune later straight in the grid)</span></label>
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
                      id={`split-${c.id}`} type="number" min="0" max="100" step="0.1" placeholder="0.0"
                      value={form.splits[c.code] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, splits: { ...f.splits, [c.code]: e.target.value } }))}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-800 text-right focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={create.isPending || update.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {editing ? (update.isPending ? 'Saving...' : 'Save Changes') : (create.isPending ? 'Adding...' : 'Add Resource')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ minHeight: 420 }}>
        <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            {rowAxis === 'resource' ? 'Resource vs. Category' : 'Resource Type vs. Category (rollup)'}
          </span>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => { setRowAxis('resource'); setRowPage(0); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${rowAxis === 'resource' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              By Resource
            </button>
            <button
              type="button"
              onClick={() => { setRowAxis('type'); setRowPage(0); }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${rowAxis === 'type' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              By Resource Type
            </button>
          </div>
        </div>

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
          <div className="flex-1 overflow-auto px-4 py-3">
            <table className="w-full border-collapse text-sm table-fixed">
              <colgroup>
                <col className="w-48" />
                {rowAxis === 'resource' && <>
                  <col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-40" />
                </>}
                {rowAxis === 'type' && <col className="w-32" />}
                {categories.map((c) => <col key={c.id} className="w-28" />)}
                <col className="w-24" />
                {rowAxis === 'resource' && <col className="w-20" />}
                <col className="w-16" />
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-white text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 pr-3 border-b border-slate-200">
                    {rowAxis === 'resource' ? 'Employee / Resource' : 'Resource Type'}
                  </th>
                  {rowAxis === 'resource' && <>
                    <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">Max Salary</th>
                    <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">Increment</th>
                    <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">After Incr.</th>
                    <th className="sticky top-0 z-10 bg-white text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">Remark</th>
                  </>}
                  {rowAxis === 'type' && (
                    <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">Salary</th>
                  )}
                  {categories.map((c) => (
                    <th key={c.id} className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">
                      <div className="truncate" title={c.name}>{c.name}</div>
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-700 uppercase tracking-wide py-2 px-3 border-b border-slate-200">
                    {rowAxis === 'resource' ? 'Total %' : 'Allocated'}
                  </th>
                  {rowAxis === 'resource' && (
                    <th className="sticky top-0 z-10 bg-white text-center text-xs font-semibold text-slate-700 uppercase tracking-wide py-2 px-3 border-b border-slate-200">Check</th>
                  )}
                  <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {rowAxis === 'resource' ? (pagedRows as ResourceRow[]).map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-amber-50/40 group">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-amber-50/40 py-2 pr-3">
                      <div className="truncate font-medium text-slate-800" title={r.name}>{r.name}</div>
                      <div className="truncate text-[10px] text-slate-400" title={r.resourceType}>{r.resourceType}</div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">{r.maxSalary === null ? '—' : formatCurrency(r.maxSalary, 'INR')}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-700">{r.incrementProvision === null ? '—' : formatCurrency(r.incrementProvision, 'INR')}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium text-slate-800">{formatCurrency(r.salaryAfterIncrement, 'INR')}</td>
                    <td className="py-2 px-3 text-slate-500 truncate" title={r.remark || ''}>{r.remark || '—'}</td>
                    {categories.map((c) => {
                      const key = cellKey(r.id, c.id);
                      const isEditing = editingCell?.key === key;
                      const pct = r.splits[c.code] || 0;
                      const displayValue = isEditing ? editingCell!.value : (pct ? pct.toFixed(1) : '');
                      return (
                        <td key={c.id} className="py-1 px-1 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <input
                              value={displayValue}
                              placeholder="—"
                              onFocus={() => setEditingCell({ key, value: pct ? String(pct) : '' })}
                              onChange={(e) => setEditingCell({ key, value: e.target.value.replace(/[^0-9.]/g, '') })}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              onBlur={() => commitCell(r, c)}
                              className="w-[64px] text-right bg-transparent outline-none rounded px-1.5 py-1 text-slate-800 focus:bg-white focus:ring-1 focus:ring-amber-500"
                            />
                            <span className="text-slate-400 text-xs">%</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-800">{r.totalAllocationPct.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-center">{checkBadge(r.check)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(r)} className="text-slate-400 hover:text-amber-600" title="Edit details"><PencilIcon className="h-4 w-4" /></button>
                        <button
                          onClick={() => { if (window.confirm(`Remove ${r.name} from the allocation matrix?`)) remove.mutate(r.id); }}
                          className="text-slate-400 hover:text-red-600" title="Remove"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (pagedRows as TypeRow[]).map((t) => (
                  <tr key={t.key} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="sticky left-0 z-10 bg-white py-2 pr-3">
                      <div className="truncate font-medium text-slate-800" title={t.resourceType}>{t.resourceType}</div>
                      <div className="text-[10px] text-slate-400">{t.count} resource{t.count === 1 ? '' : 's'}</div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium text-slate-800">{formatCurrency(t.salaryAfterIncrement, 'INR')}</td>
                    {categories.map((c) => (
                      <td key={c.id} className="py-2 px-3 text-right tabular-nums text-slate-700">{fmt(t.amounts[c.code] || 0)}</td>
                    ))}
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(t.salaryAfterIncrement, 'INR')}</td>
                    <td />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {rowAxis === 'resource' && (
                  <tr className="border-t-2 border-slate-200">
                    <td className="sticky left-0 bg-white py-2.5 pr-3 font-semibold text-slate-800">Total Employee Salary</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(data!.totals.maxSalary, 'INR')}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(data!.totals.incrementProvision, 'INR')}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-slate-800">{formatCurrency(data!.totals.salaryAfterIncrement, 'INR')}</td>
                    <td colSpan={categories.length + 4} />
                  </tr>
                )}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="sticky left-0 bg-slate-50 py-2.5 pr-3 font-semibold text-amber-700" colSpan={rowAxis === 'resource' ? 5 : 2}>
                    Salary Weightage for Shared Cost Allocation
                  </td>
                  {categories.map((c) => {
                    const w = data!.weightage.find((x) => x.categoryId === c.id);
                    return <td key={c.id} className="py-2.5 px-3 text-right tabular-nums font-semibold text-amber-700">{(w?.weightagePct ?? 0).toFixed(1)}%</td>;
                  })}
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-amber-700">
                    {data!.weightage.reduce((s, w) => s + w.weightagePct, 0).toFixed(1)}%
                  </td>
                  <td colSpan={rowAxis === 'resource' ? 2 : 1} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {!isLoading && resources.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <select
                value={rowPageSize}
                onChange={(e) => { setRowPageSize(Number(e.target.value)); setRowPage(0); }}
                className="px-2 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500"
              >
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRowPage((p) => Math.max(0, p - 1))}
                disabled={safeRowPage === 0}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Previous
              </button>
              {getPageNumbers(safeRowPage, rowTotalPages).map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setRowPage(p)}
                    className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === safeRowPage ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setRowPage((p) => Math.min(rowTotalPages - 1, p + 1))}
                disabled={safeRowPage >= rowTotalPages - 1}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              Showing {safeRowPage * rowPageSize + 1}–{Math.min((safeRowPage + 1) * rowPageSize, rowItems.length)} of {rowItems.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
