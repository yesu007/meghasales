'use client';

// Extracted from the original standalone Leave Requests page so the same
// approval queue can be reused as the "Time-off request" tab of the Time &
// Attendance page (see /dashboard/payroll/timesheet) without duplicating
// the fetch/decide logic. /dashboard/payroll/leave still renders this
// directly too, for anyone with the old page bookmarked.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface LeaveRequestRow {
  id: number;
  startDate: string;
  endDate: string;
  days: string;
  reason: string | null;
  status: string;
  appliedAt: string;
  decisionNote: string | null;
  employee: { employeeCode: string; department: string | null; firstName: string; lastName: string };
  leaveType: { name: string; code: string; isPaid: boolean };
  departmentOverlap: { employeeId: number; name: string; status: string }[];
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

async function fetchRequests(status: string): Promise<LeaveRequestRow[]> {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`/api/payroll/leave-requests${params}`);
  if (!res.ok) throw new Error('Failed to fetch leave requests');
  return res.json();
}

export default function LeaveRequestsPanel({ initialStatus = 'PENDING' }: { initialStatus?: string }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  const { data: requests = [], isLoading } = useQuery({ queryKey: ['leave-requests', statusFilter], queryFn: () => fetchRequests(statusFilter) });

  const decide = useMutation({
    mutationFn: async ({ id, status, decisionNote }: { id: number; status: 'APPROVED' | 'REJECTED' | 'CANCELLED'; decisionNote?: string }) => {
      const res = await fetch(`/api/payroll/leave-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, decisionNote }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update request'); }
      return res.json();
    },
    onSuccess: (_, { status }) => { queryClient.invalidateQueries({ queryKey: ['leave-requests'] }); toast.success(`Request ${status.toLowerCase()}`); },
    onError: (err: Error) => toast.error(err.message),
  });

  // Cancelling someone else's request needs a reason (enforced server-side
  // too) — window.prompt matches the app's existing lightweight pattern
  // for one-off input (window.confirm for deletes) rather than a new modal
  // component just for this.
  const cancelOnBehalf = (row: LeaveRequestRow) => {
    const reason = window.prompt(`Reason for cancelling ${row.employee.firstName} ${row.employee.lastName}'s leave request:`);
    if (reason == null) return;
    if (!reason.trim()) { toast.error('A reason is required'); return; }
    decide.mutate({ id: row.id, status: 'CANCELLED', decisionNote: reason.trim() });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', ''].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === s ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : requests.length === 0 ? (
        <p className="text-center py-16 text-slate-400">No {statusFilter.toLowerCase() || ''} leave requests</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Dates</th>
                <th className="px-4 py-3 text-right font-semibold text-white">Days</th>
                <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, idx) => (
                <tr key={r.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.employee.firstName} {r.employee.lastName}</p>
                    <p className="text-xs text-slate-400">{r.employee.employeeCode}{r.reason ? ` · ${r.reason}` : ''}</p>
                    {r.departmentOverlap.length > 0 && (
                      <p className="text-xs text-amber-600 font-medium mt-0.5" title={r.departmentOverlap.map((c) => c.name).join(', ')}>
                        ⚠ {r.departmentOverlap.length} other{r.departmentOverlap.length === 1 ? '' : 's'} from {r.employee.department} already on leave
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.leaveType.name}{!r.leaveType.isPaid && <span className="ml-1 text-[10px] uppercase text-red-500">unpaid</span>}</td>
                  <td className="px-4 py-3 text-slate-600">{dayjs(r.startDate).format('DD MMM')} – {dayjs(r.endDate).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{r.days}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                    {r.decisionNote && <p className="text-xs text-slate-400 mt-1 max-w-[16rem]">{r.decisionNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {r.status === 'PENDING' && (
                        <>
                          <button onClick={() => decide.mutate({ id: r.id, status: 'APPROVED' })} className="text-xs font-medium text-green-700 hover:text-green-800">Approve</button>
                          <button onClick={() => decide.mutate({ id: r.id, status: 'REJECTED' })} className="text-xs font-medium text-red-600 hover:text-red-700">Reject</button>
                        </>
                      )}
                      {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                        <button onClick={() => cancelOnBehalf(r)} className="text-xs font-medium text-slate-500 hover:text-red-600">Cancel</button>
                      )}
                    </div>
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
