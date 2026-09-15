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

async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const res = await fetch('/api/payroll/leave-types');
  if (!res.ok) throw new Error('Failed to fetch leave types');
  return res.json();
}

export default function LeaveTypesPanel() {
  const queryClient = useQueryClient();
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: '', code: '', isPaid: true });

  // code is deliberately not editable here (see the PATCH route's own
  // comment) — leaveEngine.ts and the payroll/timesheet engines key off it,
  // so only name/isPaid/annualQuota are changed through this edit form.
  // Status (isActive) is toggled straight from its own dropdown in the main
  // table row instead — see toggleActive below — not through this form.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', isPaid: true, annualQuota: '' });

  const { data: leaveTypes = [] } = useQuery({ queryKey: ['leave-types'], queryFn: fetchLeaveTypes });

  const createType = useMutation({
    mutationFn: async () => {
      // No Annual Quota field in this form anymore — new types are always
      // created unquota'd (annualQuota: null); if one ever needs its own
      // quota, that's an API-level change, not something this UI offers.
      const res = await fetch('/api/payroll/leave-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...typeForm, annualQuota: null }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create leave type'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leave-types'] }); toast.success('Leave type created'); setShowTypeForm(false); setTypeForm({ name: '', code: '', isPaid: true }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const startEdit = (t: LeaveType) => {
    setEditingId(t.id);
    setEditForm({ name: t.name, isPaid: t.isPaid, annualQuota: t.annualQuota ?? '' });
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

  // Independent of the edit form above — the Status dropdown in the main
  // table row flips isActive immediately, with no separate edit/save step.
  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/payroll/leave-types/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update status'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['leave-types'] }); toast.success('Status updated'); },
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
        <form onSubmit={(e) => { e.preventDefault(); if (!typeForm.name || !typeForm.code) { toast.error('Name and code are required'); return; } createType.mutate(); }} className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
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
          <div className="col-span-2 sm:col-span-3 flex justify-end gap-2">
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
            <th className="py-1.5 pr-4">Status</th>
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
                <td className="py-2 pr-4">
                  {/* Status isn't part of this edit form — shown read-only
                      here; use the dropdown in the normal row to change it. */}
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{t.isActive ? 'Active' : 'Inactive'}</span>
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
                <td className="py-2 pr-4 text-slate-800">{t.name}</td>
                <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs font-medium ${t.isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.isPaid ? 'Paid' : 'Unpaid'}</span></td>
                <td className="py-2 pr-4">
                  {/* Native select styled as a colored pill — same pattern
                      as the customer status dropdown on /dashboard/customers. */}
                  <select
                    value={t.isActive ? 'ACTIVE' : 'INACTIVE'}
                    onChange={(e) => toggleActive.mutate({ id: t.id, isActive: e.target.value === 'ACTIVE' })}
                    className={`px-2 py-1 rounded text-xs font-medium border-0 ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
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
    </div>
  );
}
