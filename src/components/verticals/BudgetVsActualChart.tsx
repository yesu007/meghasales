'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from 'recharts';
import { formatCurrency } from '@/lib/currency';
import { buildCategoryColorMap } from '@/lib/expenseCategoryColors';

export interface ActualExpenseBreakdownEntry {
  categoryId: number;
  categoryName: string;
  categorySortOrder: number;
  amount: number;
}

export interface VerticalBudgetActualDatum {
  id: number;
  name: string;
  budget: number | string | null;
  budgetCurrencyCode: string | null;
  actualExpenses: number;
  actualExpenseBreakdown: ActualExpenseBreakdownEntry[];
}

const BUDGET_COLOR = '#94a3b8'; // slate-400 — a neutral reference bar, distinct from the categorical Actual segments

// India-lakh abbreviation for axis ticks only — the same convention already
// used by the Accounting dashboard's charts (see its local `fmt` helper).
function axisTick(amount: number, currencyCode: string): string {
  if (currencyCode === 'INR' && Math.abs(amount) >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return formatCurrency(amount, currencyCode, { decimalPlaces: 0 });
}

interface ChartRow {
  id: number;
  name: string;
  budget: number; // 0 when unconfigured — see hasBudget for the real signal
  hasBudget: boolean;
  budgetCurrencyCode: string;
  actualTotal: number;
  [categoryKey: `cat_${number}`]: any;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row: ChartRow = payload[0]?.payload;
  if (!row) return null;

  const variance = row.hasBudget ? row.actualTotal - row.budget : null;
  const categoryEntries = payload.filter((p: any) => typeof p.dataKey === 'string' && p.dataKey.startsWith('cat_') && p.value > 0);

  return (
    <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-3 text-xs max-w-[240px]">
      <p className="font-semibold text-slate-800 mb-1.5">{label}</p>
      {row.hasBudget && (
        <div className="flex justify-between gap-3 text-slate-500">
          <span>Budget</span>
          <span className="font-medium text-slate-700">{formatCurrency(row.budget, row.budgetCurrencyCode)}</span>
        </div>
      )}
      <div className="flex justify-between gap-3 text-slate-500">
        <span>Actual</span>
        <span className="font-medium text-slate-700">{formatCurrency(row.actualTotal, row.budgetCurrencyCode)}</span>
      </div>
      {variance !== null && (
        <p className={`mt-1 font-medium ${variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
          {variance > 0
            ? `+${formatCurrency(variance, row.budgetCurrencyCode)} Over Budget`
            : `${formatCurrency(Math.abs(variance), row.budgetCurrencyCode)} Remaining`}
        </p>
      )}
      {categoryEntries.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
          {categoryEntries.map((entry: any) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />
                {entry.name}
              </span>
              <span className="text-slate-700 font-medium whitespace-nowrap">
                {formatCurrency(entry.value, row.budgetCurrencyCode)}
                {row.actualTotal > 0 && ` (${Math.round((entry.value / row.actualTotal) * 100)}%)`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Total-with-variance label drawn above each vertical's Actual stack — red
// with an over-budget marker when actual exceeds budget, so "is this
// vertical over budget" is visible without hovering (mirrors the same
// red/green convention as the table's variance subtext).
function ActualTotalLabel(rows: ChartRow[]) {
  return function Label(props: any) {
    const { x, y, width, index } = props;
    const row = rows[index];
    if (!row || row.actualTotal <= 0) return null;
    const over = row.hasBudget && row.actualTotal > row.budget;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={over ? '#DC2626' : '#334155'}>
        {over ? '▲ ' : ''}
        {axisTick(row.actualTotal, row.budgetCurrencyCode)}
      </text>
    );
  };
}

export default function BudgetVsActualChart({ verticals }: { verticals: VerticalBudgetActualDatum[] }) {
  const { rows, categories } = useMemo(() => {
    const categoryMap = new Map<number, { categoryId: number; categoryName: string; sortOrder: number }>();
    for (const v of verticals) {
      for (const b of v.actualExpenseBreakdown) {
        if (!categoryMap.has(b.categoryId)) {
          categoryMap.set(b.categoryId, { categoryId: b.categoryId, categoryName: b.categoryName, sortOrder: b.categorySortOrder });
        }
      }
    }
    const categories = Array.from(categoryMap.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.categoryId - b.categoryId);
    const colorMap = buildCategoryColorMap(categories.map((c) => ({ categoryId: c.categoryId, sortOrder: c.sortOrder })));

    const rows: ChartRow[] = verticals.map((v) => {
      const budgetCurrencyCode = v.budgetCurrencyCode || 'INR';
      const budgetNum = v.budget != null ? Number(v.budget) : 0;
      const row: ChartRow = {
        id: v.id,
        name: v.name,
        budget: budgetNum,
        hasBudget: v.budget != null && budgetNum > 0,
        budgetCurrencyCode,
        actualTotal: v.actualExpenses,
      };
      for (const c of categories) {
        const entry = v.actualExpenseBreakdown.find((b) => b.categoryId === c.categoryId);
        row[`cat_${c.categoryId}`] = entry ? entry.amount : 0;
      }
      return row;
    });

    return { rows, categories: categories.map((c) => ({ ...c, color: colorMap.get(c.categoryId)! })) };
  }, [verticals]);

  if (rows.length === 0) return null;

  const currencyCode = rows[0]?.budgetCurrencyCode || 'INR';
  const lastCategory = categories[categories.length - 1];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-slate-800">Budget vs Actual Expenses</h2>
      <p className="text-xs text-slate-400 mt-0.5 mb-3">Actual Expenses shown by category — current financial year</p>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 24, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => axisTick(v, currencyCode)} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F8FAFC' }} />
            <Legend verticalAlign="bottom" height={48} iconType="circle" wrapperStyle={{ fontSize: 11, color: '#475569' }} />
            <Bar dataKey="budget" name="Budget" fill={BUDGET_COLOR} radius={[4, 4, 0, 0]} />
            {categories.map((c) => (
              <Bar key={c.categoryId} dataKey={`cat_${c.categoryId}`} stackId="actual" name={c.categoryName} fill={c.color}>
                {c.categoryId === lastCategory?.categoryId && <LabelList content={ActualTotalLabel(rows)} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
