'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';

interface BudgetMonth { id: number; month: string; amount: string }
interface Revision { id: number; previousAmount: string; newAmount: string; reason: string | null; createdAt: string; revisedBy: { firstName: string; lastName: string } | null }
interface BudgetDetail {
  id: number;
  financialYearStart: string;
  financialYearEnd: string;
  totalAmount: string;
  currencyCode: string;
  status: string;
  notes: string | null;
  vertical: { id: number; name: string } | null;
  category: { id: number; name: string };
  createdBy: { firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  months: BudgetMonth[];
  revisions: Revision[];
}
interface VarianceMonth { month: string; budgeted: number; actual: number; varianceAmount: number; variancePercent: number | null }
interface VarianceResponse { months: VarianceMonth[]; total: { budgeted: number; actual: number; varianceAmount: number; variancePercent: number | null } }

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchBudget(id: string): Promise<BudgetDetail> {
  const res = await fetch(`/api/expense-budgets/${id}`);
  if (!res.ok) throw new Error('Failed to fetch expense budget');
  return res.json();
}
async function fetchVariance(budget: BudgetDetail): Promise<VarianceResponse> {
  const params = new URLSearchParams({ categoryId: String(budget.category.id), financialYearStart: budget.financialYearStart });
  if (budget.vertical) params.set('verticalId', String(budget.vertical.id));
  const res = await fetch(`/api/expense-budgets/variance?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch variance');
  return res.json();
}

export default function ExpenseBudgetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showRevise, setShowRevise] = useState(false);
  const [reviseForm, setReviseForm] = useState({ newAmount: '', reason: '' });

  const { data: budget, isLoading } = useQuery({ queryKey: ['expense-budget', params.id], queryFn: () => fetchBudget(params.id) });
  const { data: variance } = useQuery({
    queryKey: ['expense-budget-variance', params.id],
    queryFn: () => fetchVariance(budget!),
    enabled: !!budget,
  });

  const approve = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expense-budgets/${params.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to approve budget'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expense-budget', params.id] }); toast.success('Budget approved'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const revise = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/expense-budgets/${params.id}/revise`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reviseForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to revise budget'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-budget', params.id] });
      queryClient.invalidateQueries({ queryKey: ['expense-budget-variance', params.id] });
      toast.success('Budget revised');
      setShowRevise(false);
      setReviseForm({ newAmount: '', reason: '' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !budget) {
    return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;
  }

  const totalVarianceOver = variance && variance.total.varianceAmount > 0;

  return (
    <div className="space-y-4">
      <button onClick={() => router.push('/dashboard/expense-budgets')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeftIcon className="h-4 w-4" /> Back to Expense Budgets
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{budget.category.name} · {budget.vertical?.name || 'Company-wide'}</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              FY {dayjs(budget.financialYearStart).format('DD MMM YYYY')} – {dayjs(budget.financialYearEnd).format('DD MMM YYYY')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded text-xs font-medium ${budget.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>{budget.status}</span>
            {budget.status === 'DRAFT' && (
              <button onClick={() => approve.mutate()} disabled={approve.isPending} className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
                Approve
              </button>
            )}
            <button onClick={() => setShowRevise((v) => !v)} className="px-3 py-1.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
              Revise
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div><p className="text-xs text-slate-400 uppercase">Total Budget</p><p className="text-lg font-semibold text-slate-800">{formatCurrency(budget.totalAmount, budget.currencyCode)}</p></div>
          <div><p className="text-xs text-slate-400 uppercase">Actual (to date)</p><p className="text-lg font-semibold text-slate-800">{variance ? formatCurrency(variance.total.actual, budget.currencyCode) : '…'}</p></div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Variance</p>
            <p className={`text-lg font-semibold ${totalVarianceOver ? 'text-red-600' : 'text-green-600'}`}>
              {variance ? formatCurrency(variance.total.varianceAmount, budget.currencyCode) : '…'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase">Variance %</p>
            <p className={`text-lg font-semibold ${totalVarianceOver ? 'text-red-600' : 'text-green-600'}`}>
              {variance?.total.variancePercent != null ? `${variance.total.variancePercent.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
        {budget.notes && <p className="text-sm text-slate-500 mt-3">{budget.notes}</p>}
        <p className="text-xs text-slate-400 mt-3">
          Created by {budget.createdBy ? `${budget.createdBy.firstName} ${budget.createdBy.lastName}` : 'Unknown'}
          {budget.approvedBy && ` · Approved by ${budget.approvedBy.firstName} ${budget.approvedBy.lastName}`}
        </p>
      </div>

      {showRevise && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reviseForm.newAmount) { toast.error('New amount is required'); return; }
            if (budget.status === 'APPROVED' && !reviseForm.reason.trim()) { toast.error('A reason is required to revise an approved budget'); return; }
            revise.mutate();
          }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">Revise Budget</h2>
          <p className="text-sm text-slate-500 mb-3">
            The monthly spread is re-split evenly across the remaining financial year; each revision keeps a permanent before/after record below.
            {budget.status === 'APPROVED' && ' This budget is approved, so a reason is required to change its amount.'}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Total Amount</label>
              <input type="number" min="0.01" step="0.01" value={reviseForm.newAmount} onChange={(e) => setReviseForm((f) => ({ ...f, newAmount: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason {budget.status === 'APPROVED' && <span className="text-red-500">*</span>}
              </label>
              <input
                value={reviseForm.reason}
                onChange={(e) => setReviseForm((f) => ({ ...f, reason: e.target.value }))}
                className={inputCls}
                placeholder={budget.status === 'APPROVED' ? 'Required — e.g. Added a new hire mid-year' : 'e.g. Added a new hire mid-year'}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowRevise(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={revise.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {revise.isPending ? 'Saving...' : 'Save Revision'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200"><h2 className="text-base font-semibold text-slate-800">Budget vs Actual, by Month</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold text-white">Month</th>
                <th className="px-4 py-2.5 text-right font-semibold text-white">Budgeted</th>
                <th className="px-4 py-2.5 text-right font-semibold text-white">Actual</th>
                <th className="px-4 py-2.5 text-right font-semibold text-white">Variance</th>
                <th className="px-4 py-2.5 text-right font-semibold text-white">Variance %</th>
              </tr>
            </thead>
            <tbody>
              {(variance?.months || []).map((m, idx) => (
                <tr key={m.month} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-4 py-2.5 text-slate-700">{dayjs(`${m.month}-01`).format('MMM YYYY')}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(m.budgeted, budget.currencyCode)}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{formatCurrency(m.actual, budget.currencyCode)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${m.varianceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(m.varianceAmount, budget.currencyCode)}</td>
                  <td className={`px-4 py-2.5 text-right font-medium ${m.varianceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>{m.variancePercent != null ? `${m.variancePercent.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              {(!variance || variance.months.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No budgeted or actual data for this budget yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {budget.revisions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-3">Revision History</h2>
          <ul className="space-y-2">
            {budget.revisions.map((r) => (
              <li key={r.id} className="text-sm text-slate-600 border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-slate-800">{formatCurrency(r.previousAmount, budget.currencyCode)} → {formatCurrency(r.newAmount, budget.currencyCode)}</span>
                {r.reason && <span> — {r.reason}</span>}
                <span className="text-xs text-slate-400"> · {dayjs(r.createdAt).format('DD MMM YYYY')}{r.revisedBy ? ` by ${r.revisedBy.firstName} ${r.revisedBy.lastName}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
