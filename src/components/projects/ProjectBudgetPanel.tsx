'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { PencilIcon } from '@heroicons/react/24/outline';
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

export default function ProjectBudgetPanel({ projectId }: { projectId: number }) {
  const { data: quotations = [], isLoading: loadingQuotations } = useQuery({
    queryKey: ['project-budget-quotations', projectId],
    queryFn: () => fetchProjectQuotations(projectId),
  });
  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['project-budget-expenses', projectId],
    queryFn: () => fetchProjectExpenses(projectId),
  });

  const estimatedByCurrency = sumByCurrency(
    quotations.filter((q) => BUDGET_STATUSES.includes(q.status)).map((q) => ({ amount: q.totalAmount, currencyCode: q.currencyCode }))
  );
  const actualByCurrency = sumByCurrency(expenses.map((e) => ({ amount: Number(e.amount), currencyCode: e.currencyCode })));
  const currencies = Array.from(new Set([...Object.keys(estimatedByCurrency), ...Object.keys(actualByCurrency)]));

  if (loadingQuotations || loadingExpenses) {
    return <div className="py-6 text-center text-sm text-slate-400">Loading budget details…</div>;
  }

  return (
    <div className="py-4 space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Budget Estimations</p>
        {quotations.length === 0 ? (
          <p className="text-sm text-slate-400">No Budget Estimation created for this project yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase">
                  <th className="py-1.5 pr-4">Quotation #</th>
                  <th className="py-1.5 pr-4">Status</th>
                  <th className="py-1.5 pr-4">Date</th>
                  <th className="py-1.5 pr-4 text-right">Total</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotations.map((q) => (
                  <tr key={q.id}>
                    <td className="py-1.5 pr-4 text-slate-700">{q.quotationNumber}</td>
                    <td className="py-1.5 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${QUOTATION_STATUS_COLORS[q.status] || 'bg-slate-100 text-slate-700'}`}>{q.status}</span>
                    </td>
                    <td className="py-1.5 pr-4 text-slate-500">{dayjs(q.createdAt).format('DD MMM YYYY')}</td>
                    <td className="py-1.5 pr-4 text-right text-slate-700">{formatCurrency(q.totalAmount, q.currencyCode)}</td>
                    <td className="py-1.5 text-right">
                      <Link href={`/dashboard/quotations/calculator/${q.id}`} className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 inline-flex" title="View / Edit">
                        <PencilIcon className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Budget vs Actual</p>
        {currencies.length === 0 ? (
          <p className="text-sm text-slate-400">No Sent/Approved Budget Estimation or recorded expense yet.</p>
        ) : (
          <div className="space-y-2">
            {currencies.map((currency) => {
              const estimated = estimatedByCurrency[currency] || 0;
              const actual = actualByCurrency[currency] || 0;
              const variance = estimated - actual;
              const overBudget = estimated > 0 && actual > estimated;
              return (
                <div key={currency} className="grid grid-cols-3 gap-4 bg-slate-50 rounded-lg p-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400 uppercase">Estimated Budget</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(estimated, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase">Actual Expense</p>
                    <p className="font-semibold text-slate-800 mt-0.5">{formatCurrency(actual, currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 uppercase">{overBudget ? 'Over Budget' : 'Remaining'}</p>
                    <p className={`font-semibold mt-0.5 ${overBudget ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(Math.abs(variance), currency)}</p>
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
