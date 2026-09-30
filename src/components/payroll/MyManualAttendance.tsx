'use client';

// My Space → Attendance → Manual Attendance — for days the Access Control
// device can't record (e.g. working from another country). The employee
// applies with the day's login/logout; an approver decides from Time &
// Attendance → Manual Attendance. Only an approved request marks the day
// Present — until then it stays Absent.

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { MANUAL_STATUS_COLORS } from '@/components/payroll/ManualAttendancePanel';

interface MyManualRequest {
  id: number;
  attendanceDate: string;
  loginTime: string;
  logoutTime: string;
  workLocation: string | null;
  reason: string;
  status: string;
  appliedAt: string;
  decisionNote: string | null;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';
const blankForm = () => ({ attendanceDate: dayjs().format('YYYY-MM-DD'), loginTime: '10:00', logoutTime: '19:00', workLocation: '', reason: '' });

async function fetchMine(year: number, month: number): Promise<MyManualRequest[]> {
  const res = await fetch(`/api/payroll/manual-attendance/mine?year=${year}&month=${month}`);
  if (!res.ok) throw new Error('Failed to fetch manual attendance');
  return (await res.json()).requests;
}

export default function MyManualAttendance({ year, month, monthLabel }: { year: number; month: number; monthLabel: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['my-manual-attendance', year, month],
    queryFn: () => fetchMine(year, month),
    // While something is awaiting approval, keep checking so an approver's
    // decision shows up here without a reload.
    refetchInterval: (q) => ((q.state.data || []).some((r) => r.status === 'PENDING') ? 20_000 : false),
  });
  // A request just got decided (by an approver elsewhere) → refresh the
  // attendance above so the day turns Present (or stays Absent) straight away.
  const statusSignature = requests.map((r) => `${r.id}:${r.status}`).join(',');
  const lastSignature = useRef(statusSignature);
  useEffect(() => {
    if (lastSignature.current && lastSignature.current !== statusSignature) queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
    lastSignature.current = statusSignature;
  }, [statusSignature, queryClient]);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-manual-attendance'] });
    queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
  };

  const apply = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/manual-attendance/mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to apply'); }
      return res.json();
    },
    onSuccess: () => { refresh(); setOpen(false); setForm(blankForm()); toast.success('Manual attendance submitted for approval'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/manual-attendance/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CANCELLED' }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to cancel'); }
      return res.json();
    },
    onSuccess: () => { refresh(); toast.success('Request withdrawn'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.attendanceDate || !form.loginTime || !form.logoutTime) { toast.error('Date, login and logout time are required'); return; }
    if (form.logoutTime <= form.loginTime) { toast.error('Logout time must be after login time'); return; }
    if (!form.reason.trim()) { toast.error('Reason is required'); return; }
    apply.mutate();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-800">Manual Attendance</h2>
        {!open && (
          <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> Apply Manual Attendance
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} className="p-4 sm:p-5 border-b border-slate-200 bg-amber-50/40 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-xs font-medium text-slate-600 space-y-1">
              <span>Date</span>
              <input type="date" value={form.attendanceDate} max={dayjs().add(1, 'day').format('YYYY-MM-DD')} onChange={(e) => setForm((f) => ({ ...f, attendanceDate: e.target.value }))} className={inputCls} />
            </label>
            <label className="text-xs font-medium text-slate-600 space-y-1">
              <span>Login time</span>
              <input type="time" value={form.loginTime} onChange={(e) => setForm((f) => ({ ...f, loginTime: e.target.value }))} className={inputCls} />
            </label>
            <label className="text-xs font-medium text-slate-600 space-y-1">
              <span>Logout time</span>
              <input type="time" value={form.logoutTime} onChange={(e) => setForm((f) => ({ ...f, logoutTime: e.target.value }))} className={inputCls} />
            </label>
            <label className="text-xs font-medium text-slate-600 space-y-1">
              <span>Work location</span>
              <input value={form.workLocation} maxLength={120} placeholder="e.g. Dubai, UAE" onChange={(e) => setForm((f) => ({ ...f, workLocation: e.target.value }))} className={inputCls} />
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-600 space-y-1">
            <span>Reason</span>
            <textarea value={form.reason} maxLength={500} rows={2} placeholder="e.g. On-site at the client office in Dubai" onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputCls} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setOpen(false); setForm(blankForm()); }} className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={apply.isPending} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50">{apply.isPending ? 'Submitting…' : 'Submit for approval'}</button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-center py-10"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : requests.length === 0 ? (
        <p className="text-center py-10 text-slate-400">No manual attendance requests in {monthLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Login – Logout</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Location / Reason</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{dayjs(r.attendanceDate).format('DD MMM YYYY, ddd')}</td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">{r.loginTime} – {r.logoutTime}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[20rem]">
                    {r.workLocation && <p className="text-xs font-medium text-slate-700">{r.workLocation}</p>}
                    <p className="text-xs">{r.reason}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${MANUAL_STATUS_COLORS[r.status]}`}>{r.status}</span>
                    {r.decisionNote && <p className="text-xs text-slate-400 mt-1 max-w-[14rem]">{r.decisionNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'PENDING' && (
                      <button onClick={() => { if (window.confirm('Withdraw this manual attendance request?')) cancel.mutate(r.id); }} disabled={cancel.isPending} className="flex items-center gap-1 ml-auto text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">
                        <XMarkIcon className="h-3.5 w-3.5" /> Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
