'use client';

import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface EmployeeOption { id: number; employeeCode: string; userName: string }
interface Repayment { id: number; runId: number; amount: string; status: string; createdAt: string }
interface LoanRow {
  id: number;
  principal: string;
  outstandingBalance: string;
  monthlyInstallment: string;
  reason: string | null;
  disbursedDate: string;
  status: string;
  employee: { employeeCode: string; firstName: string; lastName: string };
}
interface RunOption { id: number; payPeriodYear: number; payPeriodMonth: number; status: string }

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchLoans(): Promise<LoanRow[]> {
  const res = await fetch('/api/payroll/loans');
  if (!res.ok) throw new Error('Failed to fetch loans');
  return res.json();
}
async function fetchEmployees(): Promise<EmployeeOption[]> {
  const res = await fetch('/api/payroll/employees');
  if (!res.ok) throw new Error('Failed to fetch employees');
  return (await res.json()).content;
}
async function fetchRuns(): Promise<RunOption[]> {
  const res = await fetch('/api/payroll/runs');
  if (!res.ok) throw new Error('Failed to fetch runs');
  return res.json();
}
async function fetchLoanDetail(id: number): Promise<LoanRow & { repayments: Repayment[] }> {
  const res = await fetch(`/api/payroll/loans/${id}`);
  if (!res.ok) throw new Error('Failed to fetch loan');
  return res.json();
}

export default function LoansPage() {
  const queryClient = useQueryClient();
  const { data: loans = [], isLoading } = useQuery({ queryKey: ['loans'], queryFn: fetchLoans });
  const { data: employees = [] } = useQuery({ queryKey: ['payroll-employees-all'], queryFn: fetchEmployees });
  const { data: runs = [] } = useQuery({ queryKey: ['payroll-runs'], queryFn: fetchRuns });

  const [showForm, setShowForm] = useState(false);
  const blankForm = { employeeId: '', principal: '', monthlyInstallment: '', disbursedDate: dayjs().format('YYYY-MM-DD'), reason: '' };
  const [form, setForm] = useState(blankForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createLoan = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/loans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create loan'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['loans'] }); toast.success('Loan created'); setShowForm(false); setForm(blankForm); },
    onError: (err: Error) => toast.error(err.message),
  });

  const draftRuns = runs.filter((r) => r.status === 'DRAFT');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Loans &amp; Advances</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Track employee loans and apply installments to a draft run</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> New Loan
        </button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { e.preventDefault(); if (!form.employeeId || !form.principal || !form.monthlyInstallment) { toast.error('Employee, principal, and monthly installment are required'); return; } createLoan.mutate(); }} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Employee</label>
              <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className={inputCls}>
                <option value="">Select employee</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.userName} ({e.employeeCode})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Disbursed Date</label>
              <input type="date" value={form.disbursedDate} onChange={(e) => setForm((f) => ({ ...f, disbursedDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Principal (₹)</label>
              <input type="number" min="1" value={form.principal} onChange={(e) => setForm((f) => ({ ...f, principal: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Monthly Installment (₹)</label>
              <input type="number" min="1" value={form.monthlyInstallment} onChange={(e) => setForm((f) => ({ ...f, monthlyInstallment: e.target.value }))} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Reason</label>
              <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputCls} placeholder="e.g. Medical emergency advance" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={createLoan.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">Create Loan</button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : loans.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No loans yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Principal</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Monthly Installment</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Outstanding</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan, idx) => (
                  <LoanRowView key={loan.id} loan={loan} draftRuns={draftRuns} expanded={expandedId === loan.id} onToggle={() => setExpandedId((id) => (id === loan.id ? null : loan.id))} idx={idx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LoanRowView({ loan, draftRuns, expanded, onToggle, idx }: { loan: LoanRow; draftRuns: RunOption[]; expanded: boolean; onToggle: () => void; idx: number }) {
  const queryClient = useQueryClient();
  const { data: detail } = useQuery({ queryKey: ['loan', loan.id], queryFn: () => fetchLoanDetail(loan.id), enabled: expanded });

  const [runId, setRunId] = useState('');
  const [amount, setAmount] = useState(String(Math.min(Number(loan.monthlyInstallment), Number(loan.outstandingBalance))));

  const apply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/payroll/loans/${loan.id}/apply-to-run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: Number(runId), amount: Number(amount) }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to apply installment'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['loans'] }); queryClient.invalidateQueries({ queryKey: ['loan', loan.id] }); toast.success('Installment applied to run'); setRunId(''); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Fragment>
      <tr
        onClick={onToggle}
        className={`cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}
      >
        <td className="px-4 py-3">
          <p className="font-medium text-slate-800">{loan.employee.firstName} {loan.employee.lastName} <span className="text-xs text-slate-400 font-normal">({loan.employee.employeeCode})</span></p>
          <p className="text-xs text-slate-400">{loan.reason || 'No reason given'}</p>
        </td>
        <td className="px-4 py-3 text-right text-slate-600">₹{Number(loan.principal).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3 text-right text-slate-600">₹{Number(loan.monthlyInstallment).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3 text-right text-slate-700">₹{Number(loan.outstandingBalance).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[loan.status]}`}>{loan.status}</span></td>
        <td className="px-4 py-3 text-right">{expanded ? <ChevronUpIcon className="h-4 w-4 text-slate-400 inline-block" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400 inline-block" />}</td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Repayment History</p>
                {detail?.repayments.length ? (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {detail.repayments.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1.5 text-slate-600">Run #{r.runId}</td>
                          <td className="py-1.5 text-right text-slate-700">₹{Number(r.amount).toLocaleString('en-IN')}</td>
                          <td className="py-1.5 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.status === 'APPLIED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-sm text-slate-400">No installments applied yet</p>}
              </div>
              {loan.status === 'ACTIVE' && (
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">Apply Installment to a Draft Run</p>
                  <div className="flex gap-2">
                    <select value={runId} onChange={(e) => setRunId(e.target.value)} className={inputCls}>
                      <option value="">Select run</option>
                      {draftRuns.map((r) => <option key={r.id} value={r.id}>{MONTH_NAMES[r.payPeriodMonth - 1]} {r.payPeriodYear}</option>)}
                    </select>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputCls} max-w-[120px]`} />
                  </div>
                  <button onClick={() => runId && apply.mutate()} disabled={!runId || apply.isPending} className="mt-2 px-3 py-1.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50">
                    {apply.isPending ? 'Applying...' : 'Apply'}
                  </button>
                  {draftRuns.length === 0 && <p className="text-xs text-slate-400 mt-1">No draft runs available right now.</p>}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
