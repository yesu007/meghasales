'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddableSelect from '@/components/AddableSelect';

interface LeaveType { id: number; name: string; code: string; isPaid: boolean; annualQuota: string | null; isActive: boolean }
interface Balance { leaveTypeId: number; name: string; code: string; isPaid: boolean; quota: number | null; usedDays: number; remaining: number | null; accruedDays?: number }
interface MyRequest {
  id: number;
  startDate: string;
  endDate: string;
  days: string;
  reason: string | null;
  status: string;
  decisionNote: string | null;
  leaveType: { name: string; isPaid: boolean };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchMine(): Promise<{ employee: { employeeCode: string } | null; requests: MyRequest[]; balances: Balance[] }> {
  const res = await fetch('/api/payroll/leave-requests/mine');
  if (!res.ok) throw new Error('Failed to fetch leave data');
  return res.json();
}

async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch('/api/payroll/leave-types');
  if (!res.ok) throw new Error('Failed to fetch leave types');
  return res.json();
}

export default function MyLeavePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['my-leave'], queryFn: fetchMine });
  const { data: leaveTypes = [] } = useQuery({ queryKey: ['leave-types'], queryFn: fetchLeaveTypes });

  const blankForm = { leaveTypeId: '', startDate: '', endDate: '', days: '', reason: '' };
  const [form, setForm] = useState(blankForm);

  // Shown instead of the old hard-block toast when a request would exceed
  // its leave type's quota — lets the employee choose to still submit, with
  // the excess days logged against Loss of Pay (see the apply mutation's
  // acknowledgeLossOfPay resubmit below), rather than rejecting outright.
  const [quotaConfirm, setQuotaConfirm] = useState<{ leaveTypeName: string; availableDays: number; excessDays: number } | null>(null);

  interface QuotaExceededError extends Error {
    quotaExceeded: true;
    leaveTypeName: string;
    availableDays: number;
    excessDays: number;
  }

  const apply = useMutation({
    mutationFn: async (opts?: { acknowledgeLossOfPay?: boolean }) => {
      const res = await fetch('/api/payroll/leave-requests/mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, acknowledgeLossOfPay: opts?.acknowledgeLossOfPay || false }) });
      if (!res.ok) {
        const err = await res.json();
        if (err.quotaExceeded) {
          const quotaErr = new Error(err.message) as QuotaExceededError;
          Object.assign(quotaErr, { quotaExceeded: true, leaveTypeName: err.leaveTypeName, availableDays: err.availableDays, excessDays: err.excessDays });
          throw quotaErr;
        }
        throw new Error(err.message || 'Failed to apply');
      }
      return res.json();
    },
    onSuccess: (data: { departmentOverlapWarning?: string | null; split?: boolean; availableDays?: number; excessDays?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['my-leave'] });
      if (data.split) {
        toast.success(`Leave request submitted — ${data.availableDays} day(s) as leave, ${data.excessDays} day(s) as Loss of Pay`);
      } else {
        toast.success('Leave request submitted');
      }
      if (data.departmentOverlapWarning) toast(data.departmentOverlapWarning, { icon: '⚠️', duration: 8000 });
      setForm(blankForm);
      setQuotaConfirm(null);
    },
    onError: (err: Error | QuotaExceededError) => {
      if ('quotaExceeded' in err && err.quotaExceeded) {
        setQuotaConfirm({ leaveTypeName: err.leaveTypeName, availableDays: err.availableDays, excessDays: err.excessDays });
        return;
      }
      toast.error(err.message);
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/leave-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to cancel'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-leave'] }); toast.success('Request cancelled'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;

  if (!data?.employee) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Leave</h1>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16 text-slate-400">No payroll profile yet — leave applications will appear here once you&apos;re onboarded.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">My Leave</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">{data.employee.employeeCode}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.balances.map((b) => (
          <div key={b.leaveTypeId} className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4">
            <p className="text-xs sm:text-sm text-slate-500">{b.name}</p>
            <p className="text-xl sm:text-2xl font-bold mt-1 text-slate-700">{b.remaining ?? '∞'}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {b.usedDays} used{b.accruedDays != null ? ` of ${b.accruedDays} accrued` : b.quota != null ? ` of ${b.quota}` : ''}
            </p>
            {b.accruedDays != null && <p className="text-[11px] text-slate-300 mt-0.5">{b.quota} days/year, accruing 1/month</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={(e) => { e.preventDefault(); if (!form.leaveTypeId || !form.startDate || !form.endDate || !form.days) { toast.error('All fields except reason are required'); return; } apply.mutate({}); }} className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3 h-fit">
          <h2 className="text-base font-semibold text-slate-800">Apply for Leave</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Leave Type</label>
            <AddableSelect
              value={form.leaveTypeId}
              onChange={(v) => setForm((f) => ({ ...f, leaveTypeId: v }))}
              options={leaveTypes.filter((t) => t.isActive).map((t) => ({ value: String(t.id), label: `${t.name}${!t.isPaid ? ' (unpaid)' : ''}` }))}
              placeholder="Select type"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">From</label><input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={inputCls} /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">To</label><input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={inputCls} /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Days</label>
            <input type="number" min="0.5" step="0.5" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} className={inputCls} placeholder="e.g. 3, or 0.5 for half-day" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reason (optional)</label>
            <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputCls} />
          </div>
          <button type="submit" disabled={apply.isPending} className="w-full px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {apply.isPending ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>

        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {data.requests.length === 0 ? (
            <p className="text-center py-16 text-slate-400">No leave requests yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Dates</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Days</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{r.leaveType.name}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(r.startDate).format('DD MMM')} – {dayjs(r.endDate).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.days}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                      {r.decisionNote && <p className="text-xs text-slate-400 mt-1 max-w-[16rem]">{r.decisionNote}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                        <button onClick={() => cancel.mutate(r.id)} className="text-xs font-medium text-slate-500 hover:text-red-600">Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {quotaConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setQuotaConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-800">Exceeds available balance</h3>
            <p className="text-sm text-slate-600 mt-2">
              Your leave request exceeds your available paid leave balance. The excess leave will be treated as Loss of Pay. Do you want to continue?
            </p>
            <p className="text-xs text-slate-400 mt-3">
              {quotaConfirm.availableDays} day(s) → {quotaConfirm.leaveTypeName}, {quotaConfirm.excessDays} day(s) → Loss of Pay
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setQuotaConfirm(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800">Cancel</button>
              <button
                onClick={() => apply.mutate({ acknowledgeLossOfPay: true })}
                disabled={apply.isPending}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {apply.isPending ? 'Submitting...' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
