'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList } from 'recharts';
import { formatCurrency } from '@/lib/currency';
import type { VerticalBudgetActualDatum } from './BudgetVsActualChart';

// Distinct from Chart 1's categorical palette on purpose — this chart's
// colors carry a different meaning (used/remaining/over), so reusing a
// categorical slot (e.g. blue for "Salary & Wages" in Chart 1) here would
// make the same color mean two different things across the page.
const USED_COLOR = '#D97706'; // amber-600, this app's single existing accent color
const REMAINING_COLOR = '#E2E8F0'; // slate-200, neutral unused-budget track
const OVER_COLOR = '#DC2626'; // red-600, same red already used for "over budget" in the table and Chart 1
const NO_BUDGET_COLOR = '#CBD5E1'; // slate-300, muted placeholder when there's nothing to compare against

type Status = 'UNDER_BUDGET' | 'OVER_BUDGET' | 'NO_BUDGET';

interface UtilizationRow {
  id: number;
  name: string;
  budget: number; // 0 when unconfigured
  hasBudget: boolean;
  budgetCurrencyCode: string;
  actualExpenses: number;
  remaining: number;
  variance: number;
  utilizationPercent: number | null;
  status: Status;
  barUsed: number; // 0-100, capped
  barRemaining: number; // 0-100, capped
}

function buildRows(verticals: VerticalBudgetActualDatum[]): UtilizationRow[] {
  return verticals.map((v) => {
    const budgetNum = v.budget != null ? Number(v.budget) : 0;
    const hasBudget = v.budget != null && budgetNum > 0;
    const actualExpenses = v.actualExpenses;
    const remaining = hasBudget ? Math.max(budgetNum - actualExpenses, 0) : 0;
    const variance = hasBudget ? actualExpenses - budgetNum : 0;
    const utilizationPercent = hasBudget ? (actualExpenses / budgetNum) * 100 : null;
    // Same over/under threshold the table's variance subtext already uses
    // (actual strictly greater than budget) — one rule, not a second one.
    const status: Status = !hasBudget ? 'NO_BUDGET' : actualExpenses > budgetNum ? 'OVER_BUDGET' : 'UNDER_BUDGET';
    const barUsed = hasBudget ? Math.min(utilizationPercent!, 100) : 0;
    const barRemaining = hasBudget ? 100 - barUsed : 0;

    return {
      id: v.id,
      name: v.name,
      budget: budgetNum,
      hasBudget,
      budgetCurrencyCode: v.budgetCurrencyCode || 'INR',
      actualExpenses,
      remaining,
      variance,
      utilizationPercent,
      status,
      barUsed,
      barRemaining,
    };
  });
}

function TooltipRow({ label, value, valueClass = 'text-slate-700' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3 text-slate-500">
      <span>{label}</span>
      <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row: UtilizationRow = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-3 text-xs max-w-[240px]">
      <p className="font-semibold text-slate-800 mb-1.5">{label}</p>
      {!row.hasBudget ? (
        <p className="text-slate-500">No budget configured</p>
      ) : (
        <>
          <TooltipRow label="Budget" value={formatCurrency(row.budget, row.budgetCurrencyCode)} />
          <TooltipRow label="Actual Expenses" value={formatCurrency(row.actualExpenses, row.budgetCurrencyCode)} />
          <TooltipRow label="Remaining" value={formatCurrency(row.remaining, row.budgetCurrencyCode)} />
          <TooltipRow label="Utilization" value={`${row.utilizationPercent!.toFixed(1)}%`} />
          <TooltipRow
            label="Variance"
            value={`${row.variance > 0 ? '+' : row.variance < 0 ? '-' : ''}${formatCurrency(Math.abs(row.variance), row.budgetCurrencyCode)}`}
            valueClass={row.variance > 0 ? 'text-red-600' : row.variance < 0 ? 'text-emerald-600' : 'text-slate-700'}
          />
          <p className={`mt-1.5 font-semibold ${row.status === 'OVER_BUDGET' ? 'text-red-600' : 'text-emerald-600'}`}>
            {row.status === 'OVER_BUDGET' ? 'Over Budget' : 'Under Budget'}
          </p>
        </>
      )}
    </div>
  );
}

// End-of-bar label — the utilization %, or an over-budget marker, or a
// muted "no budget" note. Attached to the (invisible-when-zero) remaining
// segment so its x position always lands at the true end of the bar,
// whether the fill stopped short (under budget) or ran the full track
// (over/no budget).
function makeEndLabel(rows: UtilizationRow[]) {
  return function EndLabel(props: any) {
    const { x, y, width, height, index } = props;
    const row = rows[index];
    if (!row) return null;
    const textX = x + width + 6;
    const textY = y + height / 2 + 4;

    if (!row.hasBudget) {
      return (
        <text x={textX} y={textY} fontSize={11} fill="#94A3B8">
          No budget configured
        </text>
      );
    }
    if (row.status === 'OVER_BUDGET') {
      return (
        <text x={textX} y={textY} fontSize={11} fontWeight={600} fill={OVER_COLOR}>
          {row.utilizationPercent!.toFixed(1)}% — Over Budget
        </text>
      );
    }
    return (
      <text x={textX} y={textY} fontSize={11} fontWeight={600} fill="#334155">
        {row.utilizationPercent!.toFixed(1)}% used
      </text>
    );
  };
}

export default function BudgetUtilizationChart({ verticals }: { verticals: VerticalBudgetActualDatum[] }) {
  const rows = useMemo(() => buildRows(verticals), [verticals]);
  if (rows.length === 0) return null;

  const chartHeight = Math.max(160, rows.length * 52);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-slate-800">Budget Utilization / Expense Status</h2>
      <p className="text-xs text-slate-400 mt-0.5 mb-3">Actual used vs remaining budget, per vertical</p>

      <div className="flex items-center gap-4 mb-2 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: USED_COLOR }} /> Actual (used)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: REMAINING_COLOR }} /> Remaining</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: OVER_COLOR }} /> Over Budget</span>
      </div>

      <div style={{ width: '100%', height: chartHeight }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 96, left: 8, bottom: 4 }} barCategoryGap={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={{ stroke: '#E2E8F0' }} tickLine={false} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F8FAFC' }} />
            <Bar dataKey="barUsed" stackId="util" radius={[4, 0, 0, 4]} name="Actual" barSize={22}>
              {rows.map((r) => (
                <Cell key={r.id} fill={!r.hasBudget ? NO_BUDGET_COLOR : r.status === 'OVER_BUDGET' ? OVER_COLOR : USED_COLOR} />
              ))}
            </Bar>
            <Bar dataKey="barRemaining" stackId="util" radius={[0, 4, 4, 0]} name="Remaining" fill={REMAINING_COLOR} barSize={22}>
              <LabelList content={makeEndLabel(rows)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
