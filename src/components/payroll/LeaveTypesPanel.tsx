'use client';

// Extracted from the original standalone Leave Requests page so it can be
// reused as the "Time-off policy" tab of the Time & Attendance page (see
// /dashboard/payroll/timesheet) without duplicating the fetch/create logic.
// /dashboard/payroll/leave still renders this directly too, for anyone with
// the old page bookmarked.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import AddableSelect from '@/components/AddableSelect';

interface LeaveType {
  id: number;
  name: string;
  code: string;
  isPaid: boolean;
  annualQuota: string | null;
  isActive: boolean;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

// Any code listed here draws from a combined pool that accrues 1 day/month
// up to 12/year, instead of its own independent quota (see
// COMMON_POOL_LEAVE_CODES in leaveEngine.ts, the source of truth this list
// mirrors — Earned Leave is currently its only member). Duplicated here
// rather than imported since leaveEngine.ts pulls in PrismaClient and this
// is a client component (same reasoning as the Timesheet page's own local
// HOURS_PER_DAY constant).
const POOL_CODES = ['EARNED'];

async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch('/api/payroll/leave-types');
  if (!res.ok) throw new Error('Failed to fetch leave types');
  return res.json();
}

export default function LeaveTypesPanel() {
  const queryClient = useQueryClient();
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', code: '', isPaid: true, annualQuota: '' });

  // code is deliberately not editable here (see the PATCH route's own
  // comment) — leaveEngine.ts and the payroll/timesheet engines key off it,
  // so only name/isPaid/annualQuota/isActive are ever changed post-creation.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', isPaid: true, annualQuota: '', isActive: true });

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

  const startEdit = (t: LeaveType) => {
    setEditingId(t.id);
    setEditForm({ name: t.name, isPaid: t.isPaid, annualQuota: t.annualQuota ?? '', isActive: t.isActive });
  };
  const cancelEdit = () => setEditingId(null);

  const updateType = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/leave-types/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...editForm, annualQuota: editForm.annualQuota || null }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update leave type'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leave-types'] }); toast.success('Leave type updated'); setEditingId(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteType = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/leave-types/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete leave type'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leave-types'] }); toast.success('Leave type deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteTypeHandler = (t: LeaveType) => {
    if (!window.confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    deleteType.mutate(t.id);
  };

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
          <AddableSelect
            value={typeForm.isPaid ? 'PAID' : 'UNPAID'}
            onChange={(v) => setTypeForm((f) => ({ ...f, isPaid: v === 'PAID' }))}
            options={[
              { value: 'PAID', label: 'Paid' },
              { value: 'UNPAID', label: 'Unpaid (reduces payable days)' },
            ]}
            placeholder="Select type"
          />
          <input type="number" placeholder="Annual quota (blank = unlimited)" value={typeForm.annualQuota} onChange={(e) => setTypeForm((f) => ({ ...f, annualQuota: e.target.value }))} className={inputCls} />
          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowTypeForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={createType.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">Add</button>
          </div>
        </form>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500 uppercase">
          <tr>
            <th className="py-1.5 pr-4">Name</th>
            <th className="py-1.5 pr-4">Paid</th>
            <th className="py-1.5 pr-4">Annual Quota</th>
            <th className="py-1.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {leaveTypes.map((t) =>
            editingId === t.id ? (
              <tr key={t.id} className="bg-amber-50/50">
                <td className="py-2 pr-4">
                  <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
                </td>
                <td className="py-2 pr-4">
                  <AddableSelect
                    value={editForm.isPaid ? 'PAID' : 'UNPAID'}
                    onChange={(v) => setEditForm((f) => ({ ...f, isPaid: v === 'PAID' }))}
                    options={[
                      { value: 'PAID', label: 'Paid' },
                      { value: 'UNPAID', label: 'Unpaid (reduces payable days)' },
                    ]}
                    placeholder="Select type"
                  />
                </td>
                <td className="py-2 pr-4 space-y-1.5">
                  <input type="number" placeholder="Blank = unlimited" value={editForm.annualQuota} onChange={(e) => setEditForm((f) => ({ ...f, annualQuota: e.target.value }))} className={inputCls} />
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    <input type="checkbox" checked={editForm.isActive} onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))} className="rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                    Active (selectable when applying for leave)
                  </label>
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button onClick={cancelEdit} className="text-xs font-medium text-slate-500 hover:text-slate-700 mr-3">Cancel</button>
                  <button onClick={() => updateType.mutate(t.id)} disabled={updateType.isPending} className="text-xs font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50">
                    {updateType.isPending ? 'Saving...' : 'Save'}
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={t.id}>
                <td className="py-2 pr-4 text-slate-800">
                  {t.name}
                  {!t.isActive && <span className="ml-2 px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500">Inactive</span>}
                </td>
                <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs font-medium ${t.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.isPaid ? 'Paid' : 'Unpaid'}</span></td>
                <td className="py-2 pr-4 text-slate-600">
                  {t.annualQuota ?? 'Unlimited'}
                  {POOL_CODES.includes(t.code) && <sup className="ml-0.5 text-amber-600">†</sup>}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button onClick={() => startEdit(t)} className="p-1.5 text-slate-400 hover:text-amber-700" title="Edit">
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button onClick={() => deleteTypeHandler(t)} disabled={deleteType.isPending} className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50" title="Delete">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      {(() => {
        const poolNames = leaveTypes.filter((t) => POOL_CODES.includes(t.code)).map((t) => t.name);
        if (poolNames.length === 0) return null;
        // Phrasing adapts to however many types currently share the pool —
        // it's read as one name today (Earned Leave) but stays correct if
        // more are added back to POOL_CODES later.
        const subject = poolNames.length === 1 ? poolNames[0] : `${poolNames.slice(0, -1).join(', ')} and ${poolNames[poolNames.length - 1]}`;
        const verb = poolNames.length === 1 ? 'accrues' : 'share one combined 12-day annual entitlement, accruing';
        return (
          <p className="text-xs text-slate-400">
            † {subject} {poolNames.length === 1 ? `${verb} at 1 day per month, up to 12 days a year` : `${verb} at 1 day per month`} — not the full amount available from January.
          </p>
        );
      })()}
    </div>
  );
}
