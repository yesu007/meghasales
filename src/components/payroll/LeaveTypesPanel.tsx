'use client';

// Extracted from the original standalone Leave Requests page so it can be
// reused as the "Time-off policy" tab of the Time & Attendance page (see
// /dashboard/payroll/timesheet) without duplicating the fetch/create logic.
// /dashboard/payroll/leave still renders this directly too, for anyone with
// the old page bookmarked.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface LeaveType {
  id: number;
  name: string;
  code: string;
  isPaid: boolean;
  annualQuota: string | null;
  isActive: boolean;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch('/api/payroll/leave-types');
  if (!res.ok) throw new Error('Failed to fetch leave types');
  return res.json();
}

export default function LeaveTypesPanel() {
  const queryClient = useQueryClient();
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', code: '', isPaid: true, annualQuota: '' });

  const { data: leaveTypes = [] } = useQuery({ queryKey: ['leave-types'], queryFn: fetchLeaveTypes });

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
  );
}
