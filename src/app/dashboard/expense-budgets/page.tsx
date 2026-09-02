'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs, { Dayjs } from 'dayjs';
import { formatCurrency } from '@/lib/currency';
import { defaultMonthlySpread } from '@/lib/expenseBudgetVariance';

interface Vertical { id: number; name: string; headName?: string | null }
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

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

// Matches the underlying decimal amounts (which come back as strings from
// Prisma) into the comma-grouped display the matrix cells show at rest.
const fmt = (n: number | string) => (n === 0 || n ? Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '0');

async function fetchMatrixBudgets(financialYearStart: string): Promise<BudgetListResponse> {
  const params = new URLSearchParams({ page: '0', size: '500', financialYearStart });
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

// Page numbers with ellipsis, e.g. 1 2 3 4 … 10 — same helper as the
// Expenses list page, for a consistent pagination look across the app.
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
  if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
  return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
}

function cellKey(categoryId: number, verticalId: number | null) {
  return `${categoryId}|${verticalId ?? 'company-wide'}`;
}

function sumByCurrency(rows: BudgetRow[]): { currencyCode: string; total: number }[] {
  const map = new Map<string, number>();
  for (const b of rows) map.set(b.currencyCode, (map.get(b.currencyCode) || 0) + Number(b.totalAmount));
  return Array.from(map, ([currencyCode, total]) => ({ currencyCode, total }));
}

export default function ExpenseBudgetsPage() {
  const queryClient = useQueryClient();
  const [fyStart, setFyStart] = useState<Dayjs>(() => thisFinancialYearStart());
  const fyEnd = useMemo(() => fyStart.add(1, 'year').subtract(1, 'day'), [fyStart]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm());
  const [categoryAmounts, setCategoryAmounts] = useState<Record<number, string>>({});
  const [editingBudget, setEditingBudget] = useState<BudgetRow | null>(null);

  // Which dimension runs down the rows — the "Category vs. Vertical" /
  // "Vertical vs. Category" toggle just flips this; the matrix itself,
  // pagination and totals all key off it rather than assuming categories
  // are always the rows.
  const [rowAxis, setRowAxis] = useState<'category' | 'vertical'>('category');
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ key: string; value: string } | null>(null);

  // Scales every displayed figure in the grid — matrix cells, Row Total
  // column and the footer total row — between the monthly figures
  // ExpenseBudget.totalAmount stores and their ×12 yearly equivalent.
  // A cell being actively edited is the one exception: it always shows/
  // accepts the raw monthly amount, since that's the basis everything is
  // actually stored and spread across months on (see defaultMonthlySpread
  // and commitCell below) — only the at-rest display scales with the toggle.
  const [valueMode, setValueMode] = useState<'monthly' | 'yearly'>('monthly');
  const valueScale = valueMode === 'yearly' ? 12 : 1;

  const { data: matrixData, isLoading: matrixLoading } = useQuery({
    queryKey: ['expense-budgets-matrix', fyStart.format('YYYY-MM-DD')],
    queryFn: () => fetchMatrixBudgets(fyStart.format('YYYY-MM-DD')),
  });
  const { data: verticals = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticals });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: fetchCategories });
  const { data: currencies = [] } = useQuery({ queryKey: ['currencies'], queryFn: fetchCurrencies });

  // A category deactivated (or since deleted) after budgets were recorded
  // against it can still have rows in matrixData — excluded here so it
  // never shows as a matrix row nor counts toward Column/Row/Grand Total;
  // the matrix is scoped to the current, active category list only.
  const activeCategoryIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const matrixBudgets = useMemo(
    () => (matrixData?.content || []).filter((b) => activeCategoryIds.has(b.categoryId)),
    [matrixData, activeCategoryIds]
  );
  const budgetsByCell = useMemo(() => {
    const map = new Map<string, BudgetRow>();
    for (const b of matrixBudgets) map.set(cellKey(b.categoryId, b.verticalId), b);
    return map;
  }, [matrixBudgets]);

  const columns = useMemo(
    () => [
      ...verticals.map((v) => ({ verticalId: v.id, label: v.name, headName: v.headName })),
      { verticalId: null as number | null, label: 'Company-wide', headName: null as string | null },
    ],
    [verticals]
  );
  const grandTotals = useMemo(() => sumByCurrency(matrixBudgets), [matrixBudgets]);

  // Both axes reduced to the same shape so the table below can render
  // either one as rows and the other as columns without caring which is
  // which — `axis` records where each item came from, so cell lookups and
  // totals still key off the right one of categoryId/verticalId.
  type AxisItem = { key: string; id: number | null; label: string; headName?: string | null; axis: 'category' | 'vertical' };
  const categoryAxisItems: AxisItem[] = useMemo(
    () => categories.map((c) => ({ key: `cat-${c.id}`, id: c.id, label: c.name, axis: 'category' as const })),
    [categories]
  );
  const verticalAxisItems: AxisItem[] = useMemo(
    () => columns.map((col) => ({ key: `vert-${col.verticalId ?? 'company-wide'}`, id: col.verticalId, label: col.label, headName: col.headName, axis: 'vertical' as const })),
    [columns]
  );
  const rowAxisItems = rowAxis === 'category' ? categoryAxisItems : verticalAxisItems;
  const colAxisItems = rowAxis === 'category' ? verticalAxisItems : categoryAxisItems;
  const budgetsForAxisItem = (item: AxisItem) =>
    item.axis === 'category'
      ? matrixBudgets.filter((b) => b.categoryId === item.id)
      : matrixBudgets.filter((b) => b.verticalId === item.id);

  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const [rowPage, setRowPage] = useState(0);
  const [rowPageSize, setRowPageSize] = useState(10);
  const rowTotalPages = Math.max(1, Math.ceil(rowAxisItems.length / rowPageSize));
  const safeRowPage = Math.min(rowPage, rowTotalPages - 1);
  const pagedRowItems = useMemo(
    () => rowAxisItems.slice(safeRowPage * rowPageSize, safeRowPage * rowPageSize + rowPageSize),
    [rowAxisItems, safeRowPage, rowPageSize]
  );

  const closeForm = () => { setShowForm(false); setForm(blankForm()); setCategoryAmounts({}); setEditingBudget(null); };

  const openNewForm = () => {
    setEditingBudget(null);
    setForm(blankForm());
    setCategoryAmounts({});
    setShowForm(true);
  };

  const openEdit = async (row: BudgetRow) => {
    const res = await fetch(`/api/expense-budgets/${row.id}`);
    if (!res.ok) { toast.error('Failed to load budget'); return; }
    const detail = await res.json();
    setEditingBudget(row);
    setForm({
      financialYearStart: dayjs(detail.financialYearStart).format('YYYY-MM-DD'),
      financialYearEnd: dayjs(detail.financialYearEnd).format('YYYY-MM-DD'),
      verticalId: detail.vertical?.id ? String(detail.vertical.id) : '',
      currencyCode: detail.currencyCode,
      notes: detail.notes || '',
    });
    setShowForm(true);
  };

  const setCategoryAmount = (categoryId: number, value: string) =>
    setCategoryAmounts((prev) => ({ ...prev, [categoryId]: value }));

  const categoryEntries = useMemo(
    () => Object.entries(categoryAmounts)
      .map(([categoryId, amount]) => ({ categoryId: Number(categoryId), amount: Number(amount) }))
      .filter((e) => e.amount > 0),
    [categoryAmounts]
  );
  const categoryEntriesTotal = useMemo(() => categoryEntries.reduce((sum, e) => sum + e.amount, 0), [categoryEntries]);

  const invalidateMatrix = () => queryClient.invalidateQueries({ queryKey: ['expense-budgets-matrix'] });

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
      invalidateMatrix();
      if (succeeded > 0) toast.success(`${succeeded} expense budget${succeeded > 1 ? 's' : ''} created`);
      failures.forEach((f) => toast.error(f.reason instanceof Error ? f.reason.message : 'Failed to create a budget'));
      if (failures.length === 0) closeForm();
    },
  });

  // Category, vertical and financial year identify the budget (and its
  // amount goes through /revise for a tracked before/after), so editing
  // only ever touches currency and notes.
  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editingBudget) throw new Error('No budget selected');
      const res = await fetch(`/api/expense-budgets/${editingBudget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currencyCode: form.currencyCode, notes: form.notes }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update budget'); }
      return res.json();
    },
    onSuccess: () => {
      invalidateMatrix();
      toast.success('Expense budget updated');
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createCellMutation = useMutation({
    mutationFn: async ({ categoryId, verticalId, amount }: { categoryId: number; verticalId: number | null; amount: number }) => {
      const months = defaultMonthlySpread(amount, fyStart.format('YYYY-MM-DD'), fyEnd.format('YYYY-MM-DD'));
      const res = await fetch('/api/expense-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          financialYearStart: fyStart.format('YYYY-MM-DD'),
          financialYearEnd: fyEnd.format('YYYY-MM-DD'),
          verticalId, categoryId, totalAmount: amount, currencyCode: 'INR', months,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create budget'); }
      return res.json();
    },
    onSuccess: () => { invalidateMatrix(); toast.success('Budget created'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const reviseCellMutation = useMutation({
    mutationFn: async ({ id, newAmount }: { id: number; newAmount: number }) => {
      const res = await fetch(`/api/expense-budgets/${id}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newAmount }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update budget'); }
      return res.json();
    },
    onSuccess: () => { invalidateMatrix(); toast.success('Budget updated'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteCellMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/expense-budgets/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to delete budget'); }
    },
    onSuccess: () => { invalidateMatrix(); toast.success('Budget removed'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const commitCell = (cat: ExpenseCategory, verticalId: number | null) => {
    const key = cellKey(cat.id, verticalId);
    if (editingCell?.key !== key) return;
    const raw = editingCell.value.trim();
    setEditingCell(null);
    const newValue = raw === '' ? 0 : Number(raw);
    const existing = budgetsByCell.get(key);

    if (!existing) {
      if (newValue > 0) createCellMutation.mutate({ categoryId: cat.id, verticalId, amount: newValue });
      return;
    }
    if (newValue === Number(existing.totalAmount)) return;
    if (newValue <= 0) {
      if (existing.status === 'APPROVED') {
        toast.error("Approved budgets can't be cleared this way — open it to revise the amount instead");
        return;
      }
      const verticalLabel = verticalId != null ? (verticals.find((v) => v.id === verticalId)?.name || 'this vertical') : 'Company-wide';
      if (!window.confirm(`Remove the ${cat.name} budget for ${verticalLabel}? This cannot be undone.`)) return;
      deleteCellMutation.mutate(existing.id);
      return;
    }
    // Belt-and-suspenders: the input already refuses to enter edit mode for
    // an approved cell (see onFocus below), so this should be unreachable —
    // but a plain in-place edit must never silently overwrite an approved
    // figure, so it's guarded here too rather than trusted to the UI alone.
    if (existing.status === 'APPROVED') {
      toast.error('This budget is approved — only revise (with a reason) is allowed. Open it to revise.');
      return;
    }
    reviseCellMutation.mutate({ id: existing.id, newAmount: newValue });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Expense Budgets</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Plan annual, vertical-wise budgets and track them against actual spend</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : openNewForm())}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> New Budget
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editingBudget) { saveEdit.mutate(); return; }
            if (categoryEntries.length === 0 || !form.financialYearStart || !form.financialYearEnd) {
              toast.error('Financial year and a budget amount for at least one category are required');
              return;
            }
            save.mutate();
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingBudget ? `Edit Expense Budget — ${editingBudget.categoryName}` : 'Create Expense Budget'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Financial Year Start</label>
              <input
                type="date" value={form.financialYearStart}
                onChange={(e) => setForm((f) => ({ ...f, financialYearStart: e.target.value }))}
                disabled={!!editingBudget}
                title={editingBudget ? 'Financial year is fixed once a budget is created — delete and recreate it if this needs to change' : undefined}
                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Financial Year End</label>
              <input
                type="date" value={form.financialYearEnd}
                onChange={(e) => setForm((f) => ({ ...f, financialYearEnd: e.target.value }))}
                disabled={!!editingBudget}
                title={editingBudget ? 'Financial year is fixed once a budget is created — delete and recreate it if this needs to change' : undefined}
                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Vertical</label>
              <select
                value={form.verticalId}
                onChange={(e) => setForm((f) => ({ ...f, verticalId: e.target.value }))}
                disabled={!!editingBudget}
                title={editingBudget ? 'Vertical is fixed once a budget is created — delete and recreate it if this needs to change' : undefined}
                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
              >
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

          {editingBudget ? (
            <p className="text-xs text-slate-400 mt-4">
              Category is <span className="font-medium text-slate-600">{editingBudget.categoryName}</span> and amount is {formatCurrency(editingBudget.totalAmount, form.currencyCode)} —
              neither can be changed here. Use <span className="font-medium text-slate-600">Revise</span> on the budget&apos;s detail page to change the amount.
            </p>
          ) : (
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
                  <>
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
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-t border-slate-200">
                      <p className="text-sm font-semibold text-slate-700">Total Budget</p>
                      <p className="text-sm font-semibold text-slate-800">{formatCurrency(categoryEntriesTotal, form.currencyCode)}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={save.isPending || saveEdit.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {editingBudget
                ? (saveEdit.isPending ? 'Saving...' : 'Save Changes')
                : (save.isPending ? 'Saving...' : categoryEntries.length > 1 ? `Save Budgets (${categoryEntries.length})` : 'Save Budget')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setFyStart((d) => d.subtract(1, 'year'))} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" title="Previous financial year">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 px-2">
            FY {fyStart.format('YYYY')}–{fyEnd.format('YY')}
          </span>
          <button onClick={() => setFyStart((d) => d.add(1, 'year'))} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" title="Next financial year">
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="text-xs text-slate-500">
          {dayjs(fyStart).format('DD MMM YYYY')} – {dayjs(fyEnd).format('DD MMM YYYY')}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col" style={{ minHeight: 420 }}>
        {/* Category x vertical matrix, one cell = one expense budget */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              {rowAxis === 'category' ? 'Category vs. Vertical' : 'Vertical vs. Category'}
            </span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => { setRowAxis('category'); setRowPage(0); setActiveRowKey(null); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${rowAxis === 'category' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  By Category
                </button>
                <button
                  type="button"
                  onClick={() => { setRowAxis('vertical'); setRowPage(0); setActiveRowKey(null); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${rowAxis === 'vertical' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  By Vertical
                </button>
              </div>
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setValueMode('monthly')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${valueMode === 'monthly' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setValueMode('yearly')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${valueMode === 'yearly' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Yearly
                </button>
              </div>
            </div>
          </div>
          {matrixLoading ? (
            <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
          ) : categories.length === 0 ? (
            <p className="text-center py-16 text-slate-400">No expense categories found</p>
          ) : (
            <div className="flex-1 overflow-auto px-4 py-3">
              {/* table-fixed + explicit per-column widths so every cell in a
                  column occupies identical width regardless of how long that
                  column's header text is — a variable-width auto-layout
                  column was the root cause of numbers not lining up. */}
              <table className="w-full border-collapse text-sm table-fixed">
                <colgroup>
                  <col className="w-44" />
                  {colAxisItems.map((col) => <col key={col.key} className="w-48" />)}
                  <col className="w-36" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="sticky top-0 left-0 z-20 bg-white text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 pr-3 border-b border-slate-200">
                      {rowAxis === 'category' ? 'Category' : 'Vertical'}
                    </th>
                    {colAxisItems.map((col) => (
                      <th key={col.key} className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 px-3 border-b border-slate-200">
                        <div className="truncate" title={col.label}>{col.label}</div>
                        {col.headName && <div className="truncate text-[10px] font-normal normal-case text-slate-400" title={`Head: ${col.headName}`}>Head: {col.headName}</div>}
                      </th>
                    ))}
                    <th className="sticky top-0 z-10 bg-white text-right text-xs font-semibold text-slate-700 uppercase tracking-wide py-2 pl-3 border-b border-slate-200">
                      Row Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRowItems.map((row) => {
                    const isActive = row.key === activeRowKey;
                    const rowBudgets = budgetsForAxisItem(row);
                    return (
                      <tr
                        key={row.key}
                        onClick={() => setActiveRowKey(row.key)}
                        className={`cursor-pointer border-b border-slate-100 ${isActive ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                      >
                        <td className={`sticky left-0 z-10 py-2 pr-3 truncate ${isActive ? 'bg-amber-50' : 'bg-white'}`}>
                          <div className="truncate" title={row.label}>
                            <span className={isActive ? 'font-medium text-amber-700' : 'text-slate-700'}>{row.label}</span>
                          </div>
                          {row.headName && <div className="truncate text-[10px] text-slate-400" title={`Head: ${row.headName}`}>Head: {row.headName}</div>}
                        </td>
                        {colAxisItems.map((col) => {
                          const catItem = row.axis === 'category' ? row : col;
                          const vertItem = row.axis === 'category' ? col : row;
                          const categoryId = catItem.id as number;
                          const verticalId = vertItem.id;
                          const cat: ExpenseCategory = { id: categoryId, name: catItem.label };
                          const key = cellKey(categoryId, verticalId);
                          const budget = budgetsByCell.get(key);
                          const isEditing = editingCell?.key === key;
                          const displayValue = isEditing ? editingCell!.value : fmt((budget ? Number(budget.totalAmount) : 0) * valueScale);
                          return (
                            <td key={col.key} className="py-1.5 px-3 text-right">
                              <div className="group flex items-center justify-end gap-1">
                                {/* Reserved-width slots placed BEFORE the number, never after —
                                    an element after the input sits between it and the cell's
                                    true right edge, offsetting it from the header/Column Total
                                    (which right-align straight to that edge, nothing reserved).
                                    Their presence/visibility can only change how far left the
                                    row starts, never the number's right edge. */}
                                <div className={`flex items-center gap-1 shrink-0 transition-opacity ${budget ? 'opacity-0 group-hover:opacity-100' : 'invisible'}`}>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); if (budget) openEdit(budget); }}
                                    className="text-slate-400 hover:text-amber-600"
                                    title="Edit currency / notes"
                                    tabIndex={budget ? 0 : -1}
                                  >
                                    <PencilIcon className="h-3.5 w-3.5" />
                                  </button>
                                  <Link
                                    href={budget ? `/dashboard/expense-budgets/${budget.id}` : '#'}
                                    onClick={(e) => { if (!budget) e.preventDefault(); e.stopPropagation(); }}
                                    className="text-slate-400 hover:text-amber-600"
                                    title="View / Approve / Revise"
                                    tabIndex={budget ? 0 : -1}
                                  >
                                    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                                  </Link>
                                </div>
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${budget ? (budget.status === 'APPROVED' ? 'bg-green-500' : 'bg-slate-300') : 'bg-transparent'}`}
                                  title={budget?.status}
                                />
                                {/* Fixed-width slot for the currency symbol — same reasoning,
                                    it never shifts the number's right edge either. */}
                                <span className="w-3 shrink-0 text-center text-slate-400 text-xs">₹</span>
                                <input
                                  value={displayValue}
                                  onClick={(e) => e.stopPropagation()}
                                  onFocus={(e) => {
                                    // An approved budget is a signed-off commitment — its amount
                                    // is never edited in place, only revised (with a reason) from
                                    // the budget's detail page. Refusing to even enter edit mode
                                    // here (rather than accepting the keystrokes and rejecting on
                                    // blur) surfaces that the moment the user tries to edit it.
                                    if (budget?.status === 'APPROVED') {
                                      toast.error('This budget is approved — only revise (with a reason) is allowed. Open it to revise.');
                                      e.target.blur();
                                      return;
                                    }
                                    setEditingCell({ key, value: budget ? String(budget.totalAmount) : '' });
                                  }}
                                  onChange={(e) => setEditingCell({ key, value: e.target.value.replace(/[^0-9.]/g, '') })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                  onBlur={() => commitCell(cat, verticalId)}
                                  title={budget?.status === 'APPROVED' ? 'Approved — open the budget to revise with a reason' : undefined}
                                  className={`w-[84px] shrink-0 text-right bg-transparent outline-none rounded px-1.5 py-1 text-slate-800 ${budget?.status === 'APPROVED' ? 'cursor-not-allowed' : 'focus:bg-white focus:ring-1 focus:ring-amber-500'}`}
                                />
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-1.5 pl-3 text-right font-medium text-slate-800">
                          {sumByCurrency(rowBudgets).map((t) => <div key={t.currencyCode}>{formatCurrency(t.total * valueScale, t.currencyCode)}</div>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td className="py-2.5 pr-3 font-semibold text-slate-800">{valueMode === 'yearly' ? 'Yearly Budget' : 'Monthly Budget'}</td>
                    {colAxisItems.map((col) => {
                      const colBudgets = budgetsForAxisItem(col);
                      return (
                        <td key={col.key} className="py-2.5 px-3 text-right font-semibold text-slate-800">
                          {sumByCurrency(colBudgets).map((t) => <div key={t.currencyCode}>{formatCurrency(t.total * valueScale, t.currencyCode)}</div>)}
                        </td>
                      );
                    })}
                    <td className="py-2.5 pl-3 text-right font-semibold text-amber-700">
                      {grandTotals.length === 0 ? formatCurrency(0, 'INR') : grandTotals.map((t) => <div key={t.currencyCode}>{formatCurrency(t.total * valueScale, t.currencyCode)}</div>)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {!matrixLoading && categories.length > 0 && (
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
                Showing {safeRowPage * rowPageSize + 1}–{Math.min((safeRowPage + 1) * rowPageSize, rowAxisItems.length)} of {rowAxisItems.length}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
