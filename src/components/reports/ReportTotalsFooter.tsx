'use client';

import { formatCurrency } from '@/lib/currency';
import { computeReportTotals } from '@/lib/reportTotals';

interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' | 'percent' }

export interface StatusSplit { currencyCode: string; paid: number; pending: number }

// One totals row per currency, never a blended one. Reports here are grouped
// per currency precisely because summing ₹ and $ produces a meaningless
// figure — a footer that ignored that would reintroduce the bug the grouping
// exists to prevent.
//
// Totals are derived from the rows already on screen (every 'currency' and
// 'number' column summed per currency), so the footer can never disagree
// with the table above it — there is no second calculation to drift.
export default function ReportTotalsFooter({
  columns,
  rows,
  statusSplit,
}: {
  columns: ReportColumn[];
  rows: Record<string, any>[];
  statusSplit?: StatusSplit[];
}) {
  if (rows.length === 0) return null;

  // Shared with the PDF export (src/lib/reportTotals.ts) so a printed total
  // can never disagree with the one on screen.
  const totals = computeReportTotals(columns, rows);
  if (totals.length === 0) return null;
  const byCurrency = new Map(totals.map((t) => [t.currencyCode, t.values]));

  const currencies = totals.map((t) => t.currencyCode);
  const multi = currencies.length > 1;

  return (
    <tfoot className="border-t-2 border-slate-300 bg-slate-50">
      {currencies.map((ccy) => {
        const bucket = byCurrency.get(ccy)!;
        const split = statusSplit?.find((s) => s.currencyCode === ccy);
        // The paid/pending breakdown gets the wide cell beside "Total"
        // rather than being stacked inside the narrow first column, where it
        // wraps over three lines and reads as broken.
        const showSplit = split && (split.paid > 0 || split.pending > 0);

        return (
          <tr key={ccy} className="border-t border-slate-200 first:border-t-0">
            {columns.map((col, i) => {
              if (i === 0) {
                return (
                  <td key={col.key} className="px-4 py-3 text-left align-middle whitespace-nowrap font-semibold text-slate-800">
                    Total{multi ? ` · ${ccy}` : ''}
                  </td>
                );
              }
              const isSplitCell = showSplit && i === 1 && col.type !== 'currency' && col.type !== 'number';
              if (isSplitCell) {
                return (
                  <td key={col.key} className="px-4 py-3 text-left whitespace-nowrap">
                    <SplitChips split={split!} ccy={ccy} />
                  </td>
                );
              }
              const v = bucket[col.key];
              return (
                <td
                  key={col.key}
                  className={`px-4 py-3 font-semibold text-slate-800 ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                >
                  {v === undefined ? '' : col.type === 'currency' ? formatCurrency(v, ccy) : v.toLocaleString('en-IN')}
                </td>
              );
            })}
          </tr>
        );
      })}

      {/* Fallback for layouts with no spare text cell in position 2: one
          full-width row per currency, right-aligned under the figures. */}
      {currencies.map((ccy) => {
        const split = statusSplit?.find((s) => s.currencyCode === ccy);
        if (!split || (split.paid === 0 && split.pending === 0)) return null;
        const secondCol = columns[1];
        if (secondCol && secondCol.type !== 'currency' && secondCol.type !== 'number') return null;
        return (
          <tr key={`${ccy}-split`} className="border-t border-slate-100">
            <td colSpan={columns.length} className="px-4 pb-3 pt-0 text-right">
              <SplitChips split={split} ccy={ccy} />
            </td>
          </tr>
        );
      })}
    </tfoot>
  );
}

function SplitChips({ split, ccy }: { split: StatusSplit; ccy: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs font-normal">
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-800 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Paid {formatCurrency(split.paid, ccy)}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-amber-800 whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Pending {formatCurrency(split.pending, ccy)}
      </span>
    </span>
  );
}
