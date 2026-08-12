'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

interface LeaveType {
  id: number;
  name: string;
  code: string;
  isPaid: boolean;
  annualQuota: string | null;
  isActive: boolean;
}
interface LeaveRequestRow {
  id: number;
  startDate: string;
  endDate: string;
  days: string;
  reason: string | null;
  status: string;
  appliedAt: string;
  employee: { employeeCode: string; department: string | null; firstName: string; lastName: string };
  leaveType: { name: string; code: string; isPaid: boolean };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchRequests(status: string): Promise<LeaveRequestRow[]> {
  const params = status ? `?status=${status}` : '';
  const res = await fetch(`/api/payroll/leave-requests${params}`);
  if (!res.ok) throw new Error('Failed to fetch leave requests');
  return res.json();
}

async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch('/api/payroll/leave-types');
  if (!res.ok) throw new Error('Failed to fetch leave types');
  return res.json();
}

export default function LeaveApprovalsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', code: '', isPaid: true, annualQuota: '' });

  const { data: requests = [], isLoading } = useQuery({ queryKey: ['leave-requests', statusFilter], queryFn: () => fetchRequests(statusFilter) });
  const { data: leaveTypes = [] } = useQuery({ queryKey: ['leave-types'], queryFn: fetchLeaveTypes });

  const decide = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'APPROVED' | 'REJECTED' }) => {
      const res = await fetch(`/api/payroll/leave-requests/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update request'); }
      return res.json();
    },
    onSuccess: (_, { status }) => { queryClient.invalidateQueries({ queryKey: ['leave-requests'] }); toast.success(`Request ${status.toLowerCase()}`); },
    onError: (err: Error) => toast.error(err.message),
  });

  const createType = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/leave-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...typeForm, annualQuota: typeForm.annualQuota || null }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create leave type'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leave-types'] }); toast.success('Leave type created'); setShowTypeForm(false); setTypeForm({ name: '', code: '', isPaid: true, annualQuota: '' }); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Leave Requests</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Review and decide on employee leave applications</p>
      </div>

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
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Dates</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Days</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.employee.firstName} {r.employee.lastName}</p>
                      <p className="text-xs text-slate-400">{r.employee.employeeCode}{r.reason ? ` · ${r.reason}` : ''}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.leaveType.name}{!r.leaveType.isPaid && <span className="ml-1 text-[10px] uppercase text-red-500">unpaid</span>}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(r.startDate).format('DD MMM')} – {dayjs(r.endDate).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{r.days}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span></td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => decide.mutate({ id: r.id, status: 'APPROVED' })} className="text-xs font-medium text-green-700 hover:text-green-800">Approve</button>
                          <button onClick={() => decide.mutate({ id: r.id, status: 'REJECTED' })} className="text-xs font-medium text-red-600 hover:text-red-700">Reject</button>
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Leave Types</h2>
          <button onClick={() => setShowTypeForm((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <PlusIcon className="h-4 w-4" /> Add Type
          </button>
        </div>
        {showTypeForm && (
          <form onSubmit={(e) => { e.preventDefault(); if (!typeForm.name || !typeForm.code) { toast.error('Name and code are required'); return; } createType.mutate(); }} className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <input placeholder="Name" value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            <input placeholder="Code" value={typeForm.code} onChange={(e) => setTypeForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className={inputCls} />
            <select value={typeForm.isPaid ? 'PAID' : 'UNPAID'} onChange={(e) => setTypeForm((f) => ({ ...f, isPaid: e.target.value === 'PAID' }))} className={inputCls}>
              <option value="PAID">Paid</option>
              <option value="UNPAID">Unpaid (reduces payable days)</option>
            </select>
            <input type="number" placeholder="Annual quota (blank = unlimited)" value={typeForm.annualQuota} onChange={(e) => setTypeForm((f) => ({ ...f, annualQuota: e.target.value }))} className={inputCls} />
            <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowTypeForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={createType.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">Add</button>
            </div>
          </form>
        )}
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr><th className="py-1.5 pr-4">Name</th><th className="py-1.5 pr-4">Paid</th><th className="py-1.5">Annual Quota</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leaveTypes.map((t) => (
              <tr key={t.id}>
                <td className="py-2 pr-4 text-slate-800">{t.name}</td>
                <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs font-medium ${t.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.isPaid ? 'Paid' : 'Unpaid'}</span></td>
                <td className="py-2 text-slate-600">{t.annualQuota ?? 'Unlimited'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
