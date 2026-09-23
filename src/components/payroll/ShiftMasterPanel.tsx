'use client';

// Shift Master + Employee Shift Assignment — rendered by its own top-level
// Payroll page (/dashboard/payroll/shifts), a sibling of Time & Attendance
// in the sidebar rather than a tab inside it, and deliberately not under
// My Space. Mirrors the Salary Structures page's list+inline-form+expand
// style (structures/page.tsx) since that's this codebase's existing
// convention for a "master data" CRUD screen.

import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddableSelect from '@/components/AddableSelect';

interface Shift {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  bufferMinutes: number;
  earlyLogoutBufferMinutes: number;
  attendanceRequirement: 'LOGIN_ONLY' | 'LOGIN_AND_LOGOUT';
  lateRuleMinutes: number | null;
  halfDayRuleMinutes: number | null;
  lopRuleMinutes: number | null;
  isActive: boolean;
  _count?: { assignments: number };
}
interface EmployeeOption { id: number; employeeCode: string; userName: string }
// One row of the company-wide Employee Shift Assignment table — the
// employee and shift are joined server-side (GET /api/payroll/shift-
// assignments) since this table shows every employee's current AND
// historical mapping in one place, not one employee at a time.
interface ShiftAssignment {
  id: number;
  employeeId: number;
  shiftId: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  employee: { id: number; employeeCode: string; firstName: string; lastName: string };
  shift: { id: number; name: string; startTime: string; endTime: string; attendanceRequirement: 'LOGIN_ONLY' | 'LOGIN_AND_LOGOUT' };
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';
const ATTENDANCE_TYPE_LABELS: Record<Shift['attendanceRequirement'], string> = { LOGIN_ONLY: 'Login Only', LOGIN_AND_LOGOUT: 'Login + Logout' };

async function fetchShifts(): Promise<Shift[]> {
  const res = await fetch('/api/payroll/shifts');
  if (!res.ok) throw new Error('Failed to fetch shifts');
  return res.json();
}
async function fetchEmployees(): Promise<EmployeeOption[]> {
  const res = await fetch('/api/payroll/employees?size=200&status=ACTIVE');
  if (!res.ok) throw new Error('Failed to fetch employees');
  return (await res.json()).content;
}
async function fetchAllShiftAssignments(): Promise<ShiftAssignment[]> {
  const res = await fetch('/api/payroll/shift-assignments');
  if (!res.ok) throw new Error('Failed to fetch shift assignments');
  return res.json();
}

const blankShiftForm = {
  name: '', startTime: '10:00', endTime: '19:00', bufferMinutes: '15', earlyLogoutBufferMinutes: '0',
  attendanceRequirement: 'LOGIN_AND_LOGOUT', lateRuleMinutes: '', halfDayRuleMinutes: '', lopRuleMinutes: '',
};

export default function ShiftMasterPanel() {
  const queryClient = useQueryClient();
  const { data: shifts = [] } = useQuery({ queryKey: ['shifts'], queryFn: fetchShifts });
  const { data: employees = [] } = useQuery({ queryKey: ['payroll-employees-all'], queryFn: fetchEmployees });

  const invalidateShifts = () => queryClient.invalidateQueries({ queryKey: ['shifts'] });

  // ---- Shift Master CRUD ----
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [shiftForm, setShiftForm] = useState(blankShiftForm);
  const [expandedShiftId, setExpandedShiftId] = useState<number | null>(null);
  const shiftFormRef = useRef<HTMLFormElement>(null);
  // Bumped on every "open the form" action (New Shift, or Edit — even Edit
  // on a different row while the form is already open) so the scroll
  // effect below always has something to react to. showShiftForm alone
  // isn't enough: it's already `true` in that already-open case, so React
  // sees no change and the effect wouldn't re-fire.
  const [shiftFormOpenToken, setShiftFormOpenToken] = useState(0);

  // The form renders inline above the Shift table rather than in a modal —
  // clicking Edit on a row further down (or with several shifts/expanded
  // rows pushing the table below the fold) opened it out of view with no
  // visual cue anything happened. Scroll it into view whenever it opens,
  // same as a modal would already guarantee just by overlaying the page.
  useEffect(() => {
    if (showShiftForm) shiftFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [showShiftForm, shiftFormOpenToken]);

  const resetShiftForm = () => { setShiftForm(blankShiftForm); setShowShiftForm(false); setEditingShiftId(null); };
  const openNewShiftForm = () => { setShowShiftForm(true); setShiftFormOpenToken((t) => t + 1); };
  const openEditShift = (s: Shift) => {
    setEditingShiftId(s.id);
    setShiftForm({
      name: s.name, startTime: s.startTime, endTime: s.endTime,
      bufferMinutes: String(s.bufferMinutes), earlyLogoutBufferMinutes: String(s.earlyLogoutBufferMinutes),
      attendanceRequirement: s.attendanceRequirement,
      lateRuleMinutes: s.lateRuleMinutes != null ? String(s.lateRuleMinutes) : '',
      halfDayRuleMinutes: s.halfDayRuleMinutes != null ? String(s.halfDayRuleMinutes) : '',
      lopRuleMinutes: s.lopRuleMinutes != null ? String(s.lopRuleMinutes) : '',
    });
    setShowShiftForm(true);
    setShiftFormOpenToken((t) => t + 1);
  };

  const saveShift = useMutation({
    mutationFn: async () => {
      const body = {
        name: shiftForm.name,
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        bufferMinutes: Number(shiftForm.bufferMinutes) || 0,
        earlyLogoutBufferMinutes: Number(shiftForm.earlyLogoutBufferMinutes) || 0,
        attendanceRequirement: shiftForm.attendanceRequirement,
        lateRuleMinutes: shiftForm.lateRuleMinutes === '' ? null : Number(shiftForm.lateRuleMinutes),
        halfDayRuleMinutes: shiftForm.halfDayRuleMinutes === '' ? null : Number(shiftForm.halfDayRuleMinutes),
        lopRuleMinutes: shiftForm.lopRuleMinutes === '' ? null : Number(shiftForm.lopRuleMinutes),
      };
      const res = await fetch(editingShiftId ? `/api/payroll/shifts/${editingShiftId}` : '/api/payroll/shifts', {
        method: editingShiftId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save shift'); }
      return res.json();
    },
    onSuccess: () => { invalidateShifts(); toast.success(editingShiftId ? 'Shift updated' : 'Shift created'); resetShiftForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleShiftActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/payroll/shifts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error('Failed to update shift');
      return res.json();
    },
    onSuccess: invalidateShifts,
    onError: () => toast.error('Failed to update shift'),
  });

  const deleteShift = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/shifts/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete shift'); }
      return res.json();
    },
    onSuccess: () => { invalidateShifts(); toast.success('Shift deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDeleteShift = (s: Shift) => {
    if (!window.confirm(`Delete shift "${s.name}"? This cannot be undone.`)) return;
    deleteShift.mutate(s.id);
  };

  // ---- Employee Shift Assignment (company-wide table) ----
  const { data: assignments = [] } = useQuery({ queryKey: ['shift-assignments-all'], queryFn: fetchAllShiftAssignments });
  const invalidateAssignments = () => queryClient.invalidateQueries({ queryKey: ['shift-assignments-all'] });

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignForm, setAssignForm] = useState({ employeeId: '', shiftId: '', effectiveFrom: '' });
  const resetAssignForm = () => { setAssignForm({ employeeId: '', shiftId: '', effectiveFrom: '' }); setShowAssignForm(false); };

  const assignShift = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/payroll/employees/${assignForm.employeeId}/shift-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: Number(assignForm.shiftId), effectiveFrom: assignForm.effectiveFrom }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to assign shift'); }
      return res.json();
    },
    onSuccess: () => { invalidateAssignments(); toast.success('Shift assigned'); resetAssignForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const [viewTarget, setViewTarget] = useState<ShiftAssignment | null>(null);
  const [editTarget, setEditTarget] = useState<ShiftAssignment | null>(null);
  const [editForm, setEditForm] = useState({ shiftId: '', effectiveFrom: '' });

  const openEditAssignment = (a: ShiftAssignment) => {
    setEditTarget(a);
    setEditForm({ shiftId: String(a.shiftId), effectiveFrom: a.effectiveFrom.slice(0, 10) });
  };

  const editAssignment = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error('Nothing to update');
      const res = await fetch(`/api/payroll/employees/${editTarget.employeeId}/shift-assignments/${editTarget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId: Number(editForm.shiftId), effectiveFrom: editForm.effectiveFrom }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update shift assignment'); }
      return res.json();
    },
    onSuccess: () => { invalidateAssignments(); toast.success('Shift assignment updated'); setEditTarget(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAssignment = useMutation({
    mutationFn: async (a: ShiftAssignment) => {
      const res = await fetch(`/api/payroll/employees/${a.employeeId}/shift-assignments/${a.id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete shift assignment'); }
      return res.json();
    },
    onSuccess: () => { invalidateAssignments(); toast.success('Shift assignment deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDeleteAssignment = (a: ShiftAssignment) => {
    if (!window.confirm(`Remove ${a.employee.firstName} ${a.employee.lastName}'s "${a.shift.name}" assignment (from ${dayjs(a.effectiveFrom).format('DD MMM YYYY')})? This cannot be undone.`)) return;
    deleteAssignment.mutate(a);
  };

  const employeeOptions = employees.map((e) => ({ value: String(e.id), label: `${e.userName} (${e.employeeCode})` }));
  const activeShiftOptions = shifts.filter((s) => s.isActive).map((s) => ({ value: String(s.id), label: `${s.name} (${s.startTime}–${s.endTime})` }));

  return (
    <div className="space-y-4">
      {/* Shift Master */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Shift Master</h2>
          <button onClick={() => (showShiftForm ? resetShiftForm() : openNewShiftForm())} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <PlusIcon className="h-4 w-4" /> New Shift
          </button>
        </div>

        {showShiftForm && (
          <form
            ref={shiftFormRef}
            onSubmit={(e) => {
              e.preventDefault();
              if (!shiftForm.name || !shiftForm.startTime || !shiftForm.endTime) { toast.error('Name, start time, and end time are required'); return; }
              saveShift.mutate();
            }}
            className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3 scroll-mt-4"
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <input placeholder="Shift name (e.g. General Shift)" value={shiftForm.name} onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))} className={`${inputCls} col-span-2 sm:col-span-1`} />
              <label className="text-xs text-slate-500 -mb-1 col-span-2 sm:col-span-1 sm:hidden">Start Time</label>
              <input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm((f) => ({ ...f, startTime: e.target.value }))} className={inputCls} />
              <input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm((f) => ({ ...f, endTime: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-slate-500">Buffer / Grace (minutes)</label>
                <input type="number" min="0" value={shiftForm.bufferMinutes} onChange={(e) => setShiftForm((f) => ({ ...f, bufferMinutes: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Early Logout Buffer (minutes)</label>
                <input type="number" min="0" value={shiftForm.earlyLogoutBufferMinutes} onChange={(e) => setShiftForm((f) => ({ ...f, earlyLogoutBufferMinutes: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Attendance Requirement</label>
                <AddableSelect
                  value={shiftForm.attendanceRequirement}
                  onChange={(v) => setShiftForm((f) => ({ ...f, attendanceRequirement: v }))}
                  options={[{ value: 'LOGIN_AND_LOGOUT', label: 'Login + Logout' }, { value: 'LOGIN_ONLY', label: 'Login Only' }]}
                  placeholder="Select requirement"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500">Late Arrival Rule (minutes past buffer)</label>
                <input type="number" min="0" placeholder="No cap" value={shiftForm.lateRuleMinutes} onChange={(e) => setShiftForm((f) => ({ ...f, lateRuleMinutes: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-slate-500">Half-Day Rule (minutes past Late)</label>
                <input type="number" min="0" placeholder="No cap" value={shiftForm.halfDayRuleMinutes} onChange={(e) => setShiftForm((f) => ({ ...f, halfDayRuleMinutes: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-slate-500">LOP Rule (minutes)</label>
                <input type="number" min="0" placeholder="Optional" value={shiftForm.lopRuleMinutes} onChange={(e) => setShiftForm((f) => ({ ...f, lopRuleMinutes: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetShiftForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={saveShift.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveShift.isPending ? 'Saving...' : editingShiftId ? 'Save Changes' : 'Create Shift'}
              </button>
            </div>
          </form>
        )}

        {shifts.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No shifts yet — create one to start assigning employees.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Shift</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Timing</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Buffer</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Attendance Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employees</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s, idx) => (
                  <Fragment key={s.id}>
                    <tr
                      onClick={() => setExpandedShiftId((e) => (e === s.id ? null : s.id))}
                      className={`cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600">{s.startTime}–{s.endTime}</td>
                      <td className="px-4 py-3 text-slate-600">{s.bufferMinutes} min</td>
                      <td className="px-4 py-3 text-slate-600">{ATTENDANCE_TYPE_LABELS[s.attendanceRequirement]}</td>
                      <td className="px-4 py-3 text-slate-600">{s._count?.assignments ?? 0}</td>
                      <td className="px-4 py-3">
                        <span onClick={(e) => { e.stopPropagation(); toggleShiftActive.mutate({ id: s.id, isActive: !s.isActive }); }} className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {s.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditShift(s)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                          <button onClick={() => handleDeleteShift(s)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                          <button onClick={() => setExpandedShiftId((e) => (e === s.id ? null : s.id))} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="More details">
                            {expandedShiftId === s.id ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedShiftId === s.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-xs text-slate-400">Early Logout Buffer</p><p className="text-slate-700">{s.earlyLogoutBufferMinutes} min</p></div>
                            <div><p className="text-xs text-slate-400">Late Arrival Rule</p><p className="text-slate-700">{s.lateRuleMinutes ?? 'No cap'}{s.lateRuleMinutes != null ? ' min' : ''}</p></div>
                            <div><p className="text-xs text-slate-400">Half-Day Rule</p><p className="text-slate-700">{s.halfDayRuleMinutes ?? 'No cap'}{s.halfDayRuleMinutes != null ? ' min' : ''}</p></div>
                            <div><p className="text-xs text-slate-400">LOP Rule</p><p className="text-slate-700">{s.lopRuleMinutes ?? '—'}{s.lopRuleMinutes != null ? ' min' : ''}</p></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Shift Assignment — kept as its own card, logically separate
          from Shift Master above: this is the mapping of WHICH employee
          uses a shift, not the shift's own policy. Company-wide table
          (every employee, current + historical rows) rather than a
          per-employee lookup, so Management can see who's on what shift
          at a glance. */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Employee Shift Assignment</h2>
          <button onClick={() => setShowAssignForm(true)} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <PlusIcon className="h-4 w-4" /> Assign Shift
          </button>
        </div>

        {assignments.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No shift assignments yet — use Assign Shift to map an employee to a shift.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employee Code</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Shift</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Start Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">End Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Attendance Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Effective From</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Effective To</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a, idx) => (
                  <tr key={a.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{a.employee.firstName} {a.employee.lastName}</td>
                    <td className="px-4 py-3 text-slate-600">{a.employee.employeeCode}</td>
                    <td className="px-4 py-3 text-slate-600">{a.shift.name}</td>
                    <td className="px-4 py-3 text-slate-600">{a.shift.startTime}</td>
                    <td className="px-4 py-3 text-slate-600">{a.shift.endTime}</td>
                    <td className="px-4 py-3 text-slate-600">{ATTENDANCE_TYPE_LABELS[a.shift.attendanceRequirement]}</td>
                    <td className="px-4 py-3 text-slate-600">{dayjs(a.effectiveFrom).format('DD MMM YYYY')}</td>
                    <td className="px-4 py-3 text-slate-600">{a.effectiveTo ? dayjs(a.effectiveTo).format('DD MMM YYYY') : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${a.effectiveTo ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                        {a.effectiveTo ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewTarget(a)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="View"><EyeIcon className="h-4 w-4" /></button>
                        <button onClick={() => openEditAssignment(a)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                        <button onClick={() => handleDeleteAssignment(a)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign Shift modal */}
      {showAssignForm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={resetAssignForm}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-800">Assign Shift</h3>
              <button onClick={resetAssignForm} className="p-1 text-slate-400 hover:text-slate-600"><XMarkIcon className="h-4 w-4" /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!assignForm.employeeId || !assignForm.shiftId || !assignForm.effectiveFrom) { toast.error('Employee, shift, and effective date are required'); return; }
                assignShift.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs text-slate-500">Employee</label>
                <AddableSelect value={assignForm.employeeId} onChange={(v) => setAssignForm((f) => ({ ...f, employeeId: v }))} options={employeeOptions} placeholder="Select employee" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Shift</label>
                <AddableSelect value={assignForm.shiftId} onChange={(v) => setAssignForm((f) => ({ ...f, shiftId: v }))} options={activeShiftOptions} placeholder="Select shift" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Effective Date</label>
                <input type="date" value={assignForm.effectiveFrom} onChange={(e) => setAssignForm((f) => ({ ...f, effectiveFrom: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={resetAssignForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" disabled={assignShift.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {assignShift.isPending ? 'Assigning...' : 'Assign Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit assignment modal — corrects shift/effective date on an
          assignment that hasn't been used to pay anyone yet (server-side
          guard); the employee itself isn't editable here, delete and
          re-assign instead if that was wrong. */}
      {editTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setEditTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-800">Edit Shift Assignment</h3>
              <button onClick={() => setEditTarget(null)} className="p-1 text-slate-400 hover:text-slate-600"><XMarkIcon className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-3">{editTarget.employee.firstName} {editTarget.employee.lastName} <span className="text-slate-400">({editTarget.employee.employeeCode})</span></p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editForm.shiftId || !editForm.effectiveFrom) { toast.error('Shift and effective date are required'); return; }
                editAssignment.mutate();
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-xs text-slate-500">Shift</label>
                <AddableSelect value={editForm.shiftId} onChange={(v) => setEditForm((f) => ({ ...f, shiftId: v }))} options={activeShiftOptions} placeholder="Select shift" />
              </div>
              <div>
                <label className="text-xs text-slate-500">Effective Date</label>
                <input type="date" value={editForm.effectiveFrom} onChange={(e) => setEditForm((f) => ({ ...f, effectiveFrom: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setEditTarget(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button type="submit" disabled={editAssignment.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {editAssignment.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View assignment modal — read-only detail card, same fields as the
          table, handy on narrow screens where the table scrolls. */}
      {viewTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setViewTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-slate-800">Shift Assignment</h3>
              <button onClick={() => setViewTarget(null)} className="p-1 text-slate-400 hover:text-slate-600"><XMarkIcon className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-slate-400">Employee</p><p className="text-slate-800">{viewTarget.employee.firstName} {viewTarget.employee.lastName}</p></div>
              <div><p className="text-xs text-slate-400">Employee Code</p><p className="text-slate-800">{viewTarget.employee.employeeCode}</p></div>
              <div><p className="text-xs text-slate-400">Shift</p><p className="text-slate-800">{viewTarget.shift.name}</p></div>
              <div><p className="text-xs text-slate-400">Attendance Type</p><p className="text-slate-800">{ATTENDANCE_TYPE_LABELS[viewTarget.shift.attendanceRequirement]}</p></div>
              <div><p className="text-xs text-slate-400">Start Time</p><p className="text-slate-800">{viewTarget.shift.startTime}</p></div>
              <div><p className="text-xs text-slate-400">End Time</p><p className="text-slate-800">{viewTarget.shift.endTime}</p></div>
              <div><p className="text-xs text-slate-400">Effective From</p><p className="text-slate-800">{dayjs(viewTarget.effectiveFrom).format('DD MMM YYYY')}</p></div>
              <div><p className="text-xs text-slate-400">Effective To</p><p className="text-slate-800">{viewTarget.effectiveTo ? dayjs(viewTarget.effectiveTo).format('DD MMM YYYY') : '—'}</p></div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${viewTarget.effectiveTo ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                  {viewTarget.effectiveTo ? 'Inactive' : 'Active'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
