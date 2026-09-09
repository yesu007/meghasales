'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';

interface QuotationRow {
  id: number;
  quotationNumber: string;
  status: string;
  totalAmount: number;
  currencyCode: string;
  createdAt: string;
}

interface ExpenseRow {
  amount: string;
  currencyCode: string;
}

const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-100 text-blue-700',
  NEGOTIATION: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-orange-100 text-orange-700',
};

// Only a Sent or Approved Budget Estimation counts as a real commitment
// toward the project's planned spend — a Draft/Negotiation/Rejected/Expired
// quotation isn't a budget anyone has actually signed off on yet.
const BUDGET_STATUSES = ['SENT', 'APPROVED'];

async function fetchProjectQuotations(projectId: number): Promise<QuotationRow[]> {
  const res = await fetch(`/api/quotations?projectId=${projectId}&size=100&sortBy=createdAt&sortDir=desc`);
  if (!res.ok) throw new Error('Failed to fetch budget estimations');
  const data = await res.json();
  return data.content;
}

async function fetchProjectExpenses(projectId: number): Promise<ExpenseRow[]> {
  const res = await fetch(`/api/expenses?projectId=${projectId}&size=500`);
  if (!res.ok) throw new Error('Failed to fetch expenses');
  const data = await res.json();
  return data.content;
}

function sumByCurrency(amounts: { amount: number; currencyCode: string }[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const { amount, currencyCode } of amounts) totals[currencyCode] = (totals[currencyCode] || 0) + amount;
  return totals;
}

export default function ProjectBudgetPanel({ projectId, newEstimationHref }: { projectId: number; newEstimationHref?: string }) {
  const queryClient = useQueryClient();
  const { data: quotations = [], isLoading: loadingQuotations } = useQuery({
    queryKey: ['project-budget-quotations', projectId],
    queryFn: () => fetchProjectQuotations(projectId),
  });
  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['project-budget-expenses', projectId],
    queryFn: () => fetchProjectExpenses(projectId),
  });

  const deleteQuotation = async (id: number, quotationNumber: string) => {
    if (!window.confirm(`Delete Budget Estimation "${quotationNumber}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete Budget Estimation'); return; }
    queryClient.invalidateQueries({ queryKey: ['project-budget-quotations', projectId] });
    toast.success('Budget Estimation deleted');
  };

  const estimatedByCurrency = sumByCurrency(
    quotations.filter((q) => BUDGET_STATUSES.includes(q.status)).map((q) => ({ amount: q.totalAmount, currencyCode: q.currencyCode }))
  );
  const actualByCurrency = sumByCurrency(expenses.map((e) => ({ amount: Number(e.amount), currencyCode: e.currencyCode })));
  const currencies = Array.from(new Set([...Object.keys(estimatedByCurrency), ...Object.keys(actualByCurrency)]));

  if (loadingQuotations || loadingExpenses) {
    return <div className="py-6 text-center text-sm text-slate-400">Loading budget details…</div>;
  }

  return (
    <div className="py-4 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-sm text-slate-500">Budget estimation</p>
          {newEstimationHref && (
            <Link href={newEstimationHref} className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800">
              <PlusIcon className="h-3.5 w-3.5" /> New Estimation
            </Link>
          )}
        </div>
        {quotations.length === 0 ? (
          <p className="text-sm text-slate-400">No Budget Estimation created for this project yet.</p>
        ) : (
          <div className="space-y-2">
            {quotations.map((q) => (
              <div key={q.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-slate-800">{q.quotationNumber}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${QUOTATION_STATUS_COLORS[q.status] || 'bg-slate-100 text-slate-700'}`}>{q.status}</span>
                  <span className="text-xs text-slate-400">{dayjs(q.createdAt).format('DD MMM YYYY')}</span>
                </div>
                <div className="flex items-center gap-3.5">
                  <span className="text-sm font-medium text-slate-800">{formatCurrency(q.totalAmount, q.currencyCode)}</span>
                  <Link href={`/dashboard/quotations/calculator/${q.id}`} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 inline-flex" title="View / Edit">
                    <PencilIcon className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => deleteQuotation(q.id, q.quotationNumber)}
                    className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 inline-flex"
                    title="Delete"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-1">
        {currencies.length === 0 ? (
          <>
            <p className="text-sm text-slate-500 mb-2.5">Budget vs actual</p>
            <p className="text-sm text-slate-400">No Sent/Approved Budget Estimation or recorded expense yet.</p>
          </>
        ) : (
          <div className="space-y-4">
            {currencies.map((currency) => {
              const estimated = estimatedByCurrency[currency] || 0;
              const actual = actualByCurrency[currency] || 0;
              const variance = actual - estimated;
              const utilizationPercent = estimated > 0 ? (actual / estimated) * 100 : null;
              const isOverBudget = utilizationPercent !== null && actual > estimated;
              return (
                <div key={currency}>
                  <p className="text-sm text-slate-500 mb-2.5">Budget vs actual — {currency}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs text-slate-500 mb-1">Estimated</p>
                      <p className="text-xl font-medium text-slate-800">{formatCurrency(estimated, currency)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs text-slate-500 mb-1">Spent</p>
                      <p className="text-xl font-medium text-slate-800 mb-1">{formatCurrency(actual, currency)}</p>
                      {estimated > 0 && (
                        <p className={`text-xs ${isOverBudget ? 'text-red-600' : 'text-emerald-600'}`}>
                          {isOverBudget ? `▲ ${formatCurrency(variance, currency)} over budget` : `${formatCurrency(Math.abs(variance), currency)} remaining`}
                        </p>
                      )}
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs text-slate-500 mb-1.5">Usage</p>
                      {utilizationPercent !== null ? (
                        <div title={`Estimated: ${formatCurrency(estimated, currency)}\nActual: ${formatCurrency(actual, currency)}\nRemaining: ${formatCurrency(Math.max(estimated - actual, 0), currency)}\nUsage: ${utilizationPercent.toFixed(1)}%`}>
                          <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden mb-1.5">
                            <div
                              className={`h-full rounded-full ${isOverBudget ? 'bg-red-600' : 'bg-amber-600'}`}
                              style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                            />
                          </div>
                          <p className={`text-xs ${isOverBudget ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                            {isOverBudget ? `${utilizationPercent.toFixed(1)}% — Over Budget` : `${utilizationPercent.toFixed(1)}%`}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
