'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, ArrowDownTrayIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { generatePayslipPDF } from '@/lib/generatePayslipPDF';

interface LineItem { id: number; label: string; type: string; amount: string; isAdjustment: boolean }
interface PayslipRow {
  id: number;
  employeeId: number;
  totalDays: number;
  payableDays: string;
  lopDays: string;
  grossEarnings: string;
  totalDeductions: string;
  netPay: string;
  version: number;
  employee: { employeeCode: string; department: string | null; designation: string | null; firstName: string; lastName: string };
  lineItems: LineItem[];
}
interface RunDetail {
  id: number;
  payPeriodYear: number;
  payPeriodMonth: number;
  status: string;
  version: number;
  payslips: PayslipRow[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  APPROVED: 'bg-blue-100 text-blue-700',
  PROCESSED: 'bg-amber-100 text-amber-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

async function fetchRun(id: string): Promise<RunDetail> {
  const res = await fetch(`/api/payroll/runs/${id}`);
  if (!res.ok) throw new Error('Failed to fetch payroll run');
  return res.json();
}

export default function PayrollRunDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: run, isLoading } = useQuery({ queryKey: ['payroll-run', id], queryFn: () => fetchRun(id) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-run', id] });
    queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
  };

  const changeStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/payroll/runs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, version: run!.version }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update run'); }
      return res.json();
    },
    onSuccess: (updated) => { invalidate(); toast.success(`Run moved to ${updated.status}`); },
    onError: (err: Error) => toast.error(err.message),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/payroll/runs/${id}/regenerate`, { method: 'POST' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to regenerate'); }
      return res.json();
    },
    onSuccess: (result) => { invalidate(); toast.success(`Regenerated — ${result.created} payslip(s), ${result.skipped} skipped`); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !run) {
    return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;
  }

  const isDraft = run.status === 'DRAFT';
  const totalNet = run.payslips.reduce((s, p) => s + Number(p.netPay), 0);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/payroll/runs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-amber-700 mb-2">
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to Runs
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">{MONTH_NAMES[run.payPeriodMonth - 1]} {run.payPeriodYear}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[run.status]}`}>{run.status}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {isDraft && <button onClick={() => regenerate.mutate()} disabled={regenerate.isPending} className="px-3 py-2 min-h-[40px] text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">Regenerate</button>}
            {run.status === 'DRAFT' && <button onClick={() => changeStatus.mutate('APPROVED')} disabled={changeStatus.isPending} className="px-3 py-2 min-h-[40px] text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">Approve</button>}
            {run.status === 'APPROVED' && <button onClick={() => changeStatus.mutate('PROCESSED')} disabled={changeStatus.isPending} className="px-3 py-2 min-h-[40px] text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50">Mark Processed</button>}
            {run.status === 'PROCESSED' && <button onClick={() => changeStatus.mutate('PAID')} disabled={changeStatus.isPending} className="px-3 py-2 min-h-[40px] text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">Mark Paid</button>}
            {!isDraft && <button onClick={() => changeStatus.mutate('DRAFT')} disabled={changeStatus.isPending} className="px-3 py-2 min-h-[40px] text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">Reopen to Draft</button>}
            {run.status !== 'CANCELLED' && <button onClick={() => { if (window.confirm('Cancel this payroll run?')) changeStatus.mutate('CANCELLED'); }} disabled={changeStatus.isPending} className="px-3 py-2 min-h-[40px] text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50">Cancel</button>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {run.payslips.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No payslips in this run — every employee either had no active salary assignment for this period, or there are no employees yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Employee</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Gross</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Deductions</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Net Pay</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {run.payslips.map((p) => (
                  <PayslipRowView key={p.id} payslip={p} isDraft={isDraft} periodLabel={`${MONTH_NAMES[run.payPeriodMonth - 1]} ${run.payPeriodYear}`} expanded={expandedId === p.id} onToggle={() => setExpandedId((e) => (e === p.id ? null : p.id))} onSaved={invalidate} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="px-4 py-3 font-semibold text-slate-700">Total</td>
                  <td></td><td></td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">₹{totalNet.toLocaleString('en-IN')}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PayslipRowView({ payslip, isDraft, periodLabel, expanded, onToggle, onSaved }: { payslip: PayslipRow; isDraft: boolean; periodLabel: string; expanded: boolean; onToggle: () => void; onSaved: () => void }) {
  const [lopDays, setLopDays] = useState(payslip.lopDays);
  const [adjustments, setAdjustments] = useState<Array<{ label: string; type: string; amount: string }>>(
    payslip.lineItems.filter((li) => li.isAdjustment).map((li) => ({ label: li.label, type: li.type, amount: li.amount }))
  );

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/payroll/payslips/${payslip.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lopDays: Number(lopDays), adjustments: adjustments.filter((a) => a.label && a.amount !== '').map((a) => ({ ...a, amount: Number(a.amount) })) }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save'); }
      return res.json();
    },
    onSuccess: () => { toast.success('Payslip updated'); onSaved(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const structureLines = payslip.lineItems.filter((li) => !li.isAdjustment);

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3">
          <p className="font-medium text-slate-800">{payslip.employee.firstName} {payslip.employee.lastName}</p>
          <p className="text-xs text-slate-400">{payslip.employee.employeeCode} · {payslip.payableDays}/{payslip.totalDays} days</p>
        </td>
        <td className="px-4 py-3 text-right text-slate-700">₹{Number(payslip.grossEarnings).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3 text-right text-slate-700">₹{Number(payslip.totalDeductions).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3 text-right font-medium text-slate-800">₹{Number(payslip.netPay).toLocaleString('en-IN')}</td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                generatePayslipPDF({
                  employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
                  employeeCode: payslip.employee.employeeCode,
                  department: payslip.employee.department,
                  designation: payslip.employee.designation,
                  payPeriodLabel: periodLabel,
                  totalDays: payslip.totalDays,
                  payableDays: Number(payslip.payableDays),
                  lopDays: Number(payslip.lopDays),
                  lineItems: payslip.lineItems.map((li) => ({ label: li.label, type: li.type as 'EARNING' | 'DEDUCTION', amount: Number(li.amount) })),
                  grossEarnings: Number(payslip.grossEarnings),
                  totalDeductions: Number(payslip.totalDeductions),
                  netPay: Number(payslip.netPay),
                  fileName: `Payslip-${payslip.employee.employeeCode}-${periodLabel.replace(' ', '-')}.pdf`,
                });
              }}
              className="p-1 text-slate-400 hover:text-amber-600"
              title="Download PDF"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
            </button>
            {expanded ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-4 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Structure line items</p>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-200">
                    {structureLines.map((li) => (
                      <tr key={li.id}>
                        <td className="py-1 text-slate-600">{li.label}</td>
                        <td className="py-1 text-right text-slate-700">{li.type === 'DEDUCTION' ? '-' : ''}₹{Number(li.amount).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase mb-2">Loss of pay &amp; adjustments {isDraft && '(editable)'}</p>
                {isDraft ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-slate-600 w-24">LOP days</label>
                      <input type="number" min="0" max={payslip.totalDays} step="0.5" value={lopDays} onChange={(e) => setLopDays(e.target.value)} className="w-24 px-2 py-1 border border-slate-300 rounded text-sm" />
                    </div>
                    {adjustments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input placeholder="Label" value={a.label} onChange={(e) => setAdjustments((arr) => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm" />
                        <select value={a.type} onChange={(e) => setAdjustments((arr) => arr.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} className="px-2 py-1 border border-slate-300 rounded text-sm">
                          <option value="EARNING">+ Earning</option>
                          <option value="DEDUCTION">- Deduction</option>
                        </select>
                        <input type="number" placeholder="Amount" value={a.amount} onChange={(e) => setAdjustments((arr) => arr.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} className="w-24 px-2 py-1 border border-slate-300 rounded text-sm" />
                        <button onClick={() => setAdjustments((arr) => arr.filter((_, j) => j !== i))} className="p-1 text-slate-400 hover:text-red-600"><XMarkIcon className="h-4 w-4" /></button>
                      </div>
                    ))}
                    <button onClick={() => setAdjustments((arr) => [...arr, { label: '', type: 'EARNING', amount: '' }])} className="text-sm text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1"><PlusIcon className="h-3.5 w-3.5" /> Add adjustment</button>
                    <div className="pt-2">
                      <button onClick={() => save.mutate()} disabled={save.isPending} className="px-3 py-1.5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50">{save.isPending ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-200">
                      <tr><td className="py-1 text-slate-600">LOP days</td><td className="py-1 text-right text-slate-700">{payslip.lopDays}</td></tr>
                      {payslip.lineItems.filter((li) => li.isAdjustment).map((li) => (
                        <tr key={li.id}><td className="py-1 text-slate-600">{li.label}</td><td className="py-1 text-right text-slate-700">{li.type === 'DEDUCTION' ? '-' : ''}₹{Number(li.amount).toLocaleString('en-IN')}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
