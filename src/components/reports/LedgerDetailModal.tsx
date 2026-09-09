'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon, DocumentTextIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '@/lib/currency';

interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }
interface ReportResult { title: string; columns: ReportColumn[]; rows: Record<string, any>[] }

export interface LedgerDetailTarget {
  mode: 'income' | 'expense';
  title: string;
  currencyCode: string;
  projectId?: number;
  // Scopes to one vertical when the clicked row was a vertical rather than a
  // single project. Both endpoints accept it.
  verticalId?: number;
  // Set for a Monthly row (its month) or a Transactions row (its day), so
  // the popup covers exactly the period the clicked figure covered.
  from?: string;
  to?: string;
  // A Monthly row spanning every project still counted only project-tagged
  // spend, so the popup must exclude Overall expenses the same way.
  projectOnly?: boolean;
  // Deep link out to the full Expense Report, for filtering and export.
  expenseHref?: string;
}

// Shows the individual records behind a ledger figure — invoices/payments
// for an income cell, expenses for a debit cell.
//
// The two modes read from different endpoints on purpose:
//   income  -> the ledger's own 'transactions' build, filtered client-side.
//              Invoices and payments are only meaningful together, and this
//              guarantees the footer equals the cell that was clicked.
//   expense -> the Expense Report itself, with the same filters the
//              drill-through link would carry. That returns the full column
//              set (category, sub-category, vendor, project, vertical,
//              payment method, status) rather than the ledger's four-column
//              summary, so the popup shows what the report shows. The
//              filters are identical to the ones the link uses, which is why
//              the totals still reconcile — verified per row.
export default function LedgerDetailModal({ target, onClose }: { target: LedgerDetailTarget; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isIncomeMode = target.mode === 'income';

  const qs = new URLSearchParams(
    isIncomeMode
      ? { type: 'transactions' }
      : { type: 'detail', ...(target.projectOnly ? { projectOnly: 'true' } : {}) }
  );
  if (target.projectId) qs.set('projectId', String(target.projectId));
  if (target.verticalId && !target.projectId) qs.set('verticalId', String(target.verticalId));
  if (target.from) qs.set('from', target.from);
  if (target.to) qs.set('to', target.to);
  const endpoint = isIncomeMode ? '/api/reports/project-ledger' : '/api/reports/expenses';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ledger-detail', endpoint, qs.toString()],
    queryFn: async (): Promise<ReportResult> => {
      const res = await fetch(`${endpoint}?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to load detail');
      return res.json();
    },
  });

  const rows = isIncomeMode
    ? (data?.rows ?? []).filter((r) => ['Invoice', 'Payment'].includes(String(r.type)) && String(r.currencyCode) === target.currencyCode)
    : (data?.rows ?? []).filter((r) => String(r.currencyCode) === target.currencyCode);
  // The Expense Report brings its own columns, so the popup renders whatever
  // it returns and stays in step if a column is ever added there.
  const expenseColumns = (data?.columns ?? []).filter((c) => c.key !== 'currencyCode');

  const billed = rows.reduce((a, r) => a + Number(r.billed || 0), 0);
  const credit = rows.reduce((a, r) => a + Number(r.credit || 0), 0);
  const debit = rows.reduce((a, r) => a + Number(r.debit ?? r.amount ?? 0), 0);
  const isIncome = isIncomeMode;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40" onClick={onClose}>
      <div
        className={`bg-white rounded-xl shadow-xl border border-slate-200 w-full ${isIncomeMode ? 'max-w-3xl' : 'max-w-6xl'} max-h-[80vh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {isIncome ? 'Income detail' : 'Expense detail'} — {target.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isIncome ? 'Invoices raised and payments received' : 'Expenses booked to this project'}, in {target.currencyCode}
              {target.from && target.to && target.from === target.to && ` · ${target.from}`}
              {target.from && target.to && target.from !== target.to && ` · ${target.from} to ${target.to}`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {isLoading ? (
            <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-7 bg-slate-100 rounded animate-pulse" />)}</div>
          ) : isError ? (
            <p className="p-6 text-sm text-red-600">Could not load the detail.</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="h-10 w-10 mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">Nothing to show</p>
              <p className="text-xs text-slate-400 mt-1">No {isIncome ? 'invoices or payments' : 'expenses'} in {target.currencyCode}</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              {isIncome ? (
                <>
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Date</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Type</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Reference</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Billed</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-100 last:border-0`}>
                        <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{r.date}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium rounded-full px-2 py-0.5 border ${
                            r.type === 'Payment'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : 'bg-slate-100 border-slate-200 text-slate-700'
                          }`}>{r.type}</span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700">
                          <div>{r.reference}</div>
                          <div className="text-xs text-slate-400">{r.description}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {Number(r.billed) ? formatCurrency(Number(r.billed), target.currencyCode) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-medium">
                          {Number(r.credit) ? formatCurrency(Number(r.credit), target.currencyCode) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td className="px-4 py-3" colSpan={3}>
                        Total
                        <span className="block text-xs font-normal text-slate-500 mt-0.5">
                          Outstanding {formatCurrency(billed - credit, target.currencyCode)}
                        </span>
                        <span className="block text-xs font-normal text-slate-500 mt-0.5">
                          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(billed, target.currencyCode)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(credit, target.currencyCode)}</td>
                    </tr>
                  </tfoot>
                </>
              ) : (
                <>
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      {expenseColumns.map((c) => (
                        <th key={c.key} className={`px-3 py-2.5 whitespace-nowrap font-semibold text-slate-600 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} border-b border-slate-100 last:border-0`}>
                        {expenseColumns.map((c) => (
                          <td key={c.key} className={`px-3 py-2.5 text-slate-700 whitespace-nowrap ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'}`}>
                            {c.type === 'currency' && typeof r[c.key] === 'number'
                              ? formatCurrency(Number(r[c.key]), target.currencyCode)
                              : String(r[c.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-800">
                    <tr>
                      <td className="px-3 py-3 whitespace-nowrap" colSpan={Math.max(expenseColumns.length - 1, 1)}>
                        Total
                        <span className="block text-xs font-normal text-slate-500 mt-0.5">
                          {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(debit, target.currencyCode)}</td>
                    </tr>
                  </tfoot>
                </>
              )}
            </table>
          )}
        </div>

        {/* The popup answers "what is behind this number". Filtering, grouping
            and export still belong on the full report, so the way there stays
            one click away rather than being replaced by the popup. */}
        {!isIncome && target.expenseHref && rows.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 text-right">
            {/* New tab on purpose: the ledger keeps its filters, tab and
                scroll position, and Back from the report would otherwise
                land on the Reports hub rather than where you were. */}
            <Link
              href={target.expenseHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 font-medium"
            >
              Open in Expense Report <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
