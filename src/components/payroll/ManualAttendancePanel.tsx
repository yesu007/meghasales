'use client';

// "Manual Attendance" tab of Time & Attendance — the approval queue for
// manual attendance requests (staff the Access Control device can't see,
// e.g. working from another country). Approving makes the day Present in
// the Attendance Log and My Space; pending/rejected days stay Absent.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { usePermissions } from '@/hooks/usePermissions';

interface ManualAttendanceRow {
  id: number;
  attendanceDate: string;
  loginTime: string;
  logoutTime: string;
  workLocation: string | null;
  reason: string;
  status: string;
  appliedAt: string;
  decisionNote: string | null;
  device: { status: string; loginTime: string | null } | null; // what the device recorded that day
  employee: { id: number; employeeCode: string; firstName: string; lastName: string; department: string | null };
}

export const MANUAL_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const hoursBetween = (a: string, b: string) => {
  const m = (Number(b.slice(0, 2)) * 60 + Number(b.slice(3, 5))) - (Number(a.slice(0, 2)) * 60 + Number(a.slice(3, 5)));
  return m > 0 ? `${Math.floor(m / 60)} hr ${m % 60} min` : '—';
};

async function fetchRequests(status: string): Promise<ManualAttendanceRow[]> {
  const res = await fetch(`/api/payroll/manual-attendance${status ? `?status=${status}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch manual attendance requests');
  return res.json();
}

export default function ManualAttendancePanel() {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canApprove = has('approve_manual_attendance');
  const [statusFilter, setStatusFilter] = useState('PENDING');

  const { data: requests = [], isLoading } = useQuery({ queryKey: ['manual-attendance', statusFilter], queryFn: () => fetchRequests(statusFilter) });

  const decide = useMutation({
    mutationFn: async ({ id, status, decisionNote }: { id: number; status: 'APPROVED' | 'REJECTED' | 'CANCELLED'; decisionNote?: string }) => {
      const res = await fetch(`/api/payroll/manual-attendance/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, decisionNote }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to update request'); }
      return res.json();
    },
    onSuccess: (_, { status }) => {
      // Everything that shows the decided day — the Attendance Log here and
      // My Space → Attendance (strip, Daily Attendance, request list).
      queryClient.invalidateQueries({ queryKey: ['manual-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['my-manual-attendance'] });
      toast.success(status === 'APPROVED' ? 'Approved — marked Present' : status === 'REJECTED' ? 'Rejected — stays Absent' : 'Request cancelled');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Same lightweight window.prompt pattern the leave approval queue uses.
  const withReason = (row: ManualAttendanceRow, status: 'REJECTED' | 'CANCELLED') => {
    const who = `${row.employee.firstName} ${row.employee.lastName}`.trim();
    const reason = window.prompt(`Reason for ${status === 'REJECTED' ? 'rejecting' : 'cancelling'} ${who}'s manual attendance on ${dayjs(row.attendanceDate).format('DD MMM YYYY')}:`);
    if (reason == null) return;
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    decide.mutate({ id: row.id, status, decisionNote: reason.trim() });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', ''].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">Approved requests mark the day Present; pending or rejected days stay Absent.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : requests.length === 0 ? (
        <p className="text-center py-16 text-slate-400">No {statusFilter.toLowerCase()} manual attendance requests</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Login – Logout</th>
                <th className="px-4 py-3 text-right font-semibold text-white">Working Hours</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Location / Reason</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, idx) => (
                <tr key={r.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.employee.firstName} {r.employee.lastName}</p>
                    <p className="text-xs text-slate-400">{r.employee.employeeCode} · applied {dayjs(r.appliedAt).format('DD MMM, HH:mm')}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {dayjs(r.attendanceDate).format('DD MMM YYYY, ddd')}
                    {r.device?.status === 'INCOMPLETE' && <p className="text-xs text-amber-600">Missing logout · device login {r.device.loginTime}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">{r.loginTime} – {r.logoutTime}</td>
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{hoursBetween(r.loginTime, r.logoutTime)}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[18rem]">
                    {r.workLocation && <p className="text-xs font-medium text-slate-700">{r.workLocation}</p>}
                    <p className="text-xs">{r.reason}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${MANUAL_STATUS_COLORS[r.status]}`}>{r.status}</span>
                    {r.decisionNote && <p className="text-xs text-slate-400 mt-1 max-w-[14rem]">{r.decisionNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canApprove && (
                      <div className="flex justify-end gap-3">
                        {r.status === 'PENDING' && (
                          <>
                            <button onClick={() => decide.mutate({ id: r.id, status: 'APPROVED' })} disabled={decide.isPending} className="text-xs font-medium text-green-700 hover:text-green-800 disabled:opacity-50">Approve</button>
                            <button onClick={() => withReason(r, 'REJECTED')} disabled={decide.isPending} className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">Reject</button>
                          </>
                        )}
                        {r.status === 'APPROVED' && (
                          <button onClick={() => withReason(r, 'CANCELLED')} disabled={decide.isPending} className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">Cancel</button>
                        )}
                      </div>
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
