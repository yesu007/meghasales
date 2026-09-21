'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, PencilIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddableSelect from '@/components/AddableSelect';
import LegalDocumentsPanel from '@/components/payroll/LegalDocumentsPanel';
import { usePermissions } from '@/hooks/usePermissions';

interface StructureOption {
  id: number;
  name: string;
  isActive: boolean;
}

interface Assignment {
  id: number;
  ctcAnnual: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  structure: { id: number; name: string };
}

interface ManagerOption {
  id: number;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface VerticalOption {
  id: number;
  name: string;
}

interface EmployeeDetail {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  designation: string | null;
  role: string | null;
  managerId: number | null;
  verticalId: number | null;
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
  employmentType: string;
  probationDurationMonths: number | null;
  probationEndDate: string | null;
  panNumber: string | null;
  uanNumber: string | null;
  esicNumber: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankAccountHolder: string | null;
  bankName: string | null;
  taxRegime: string;
  pfApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
  status: string;
  user: { phone: string | null } | null;
  salaryAssignments: Assignment[];
}

async function fetchEmployee(id: string): Promise<EmployeeDetail> {
  const res = await fetch(`/api/payroll/employees/${id}`);
  if (!res.ok) throw new Error('Failed to fetch employee');
  return res.json();
}

async function fetchStructures(): Promise<StructureOption[]> {
  const res = await fetch('/api/payroll/structures');
  if (!res.ok) throw new Error('Failed to fetch salary structures');
  return res.json();
}

async function fetchManagerOptions(): Promise<ManagerOption[]> {
  const res = await fetch('/api/payroll/employees?size=200&status=ACTIVE');
  if (!res.ok) return [];
  const data = await res.json();
  return data.content;
}

async function fetchVerticals(): Promise<VerticalOption[]> {
  const res = await fetch('/api/verticals');
  if (!res.ok) return [];
  return res.json();
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  // Same permission the rest of this page's edit form already requires —
  // reused rather than introducing a separate documents-specific one.
  const canManageEmployees = has('manage_employees');

  const { data: employee, isLoading } = useQuery({ queryKey: ['payroll-employee', id], queryFn: () => fetchEmployee(id) });
  const { data: structures = [] } = useQuery({ queryKey: ['payroll-structures'], queryFn: fetchStructures });
  const { data: managerOptions = [] } = useQuery({ queryKey: ['payroll-employees-manager-options'], queryFn: fetchManagerOptions });
  const { data: verticalOptions = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticals });

  const [form, setForm] = useState<Record<string, any>>({});
  // Starts true (not false, like the create form's default) — the already-
  // saved probationEndDate loaded below is the current source of truth
  // (see Employee.probationEndDate's schema comment) and must not be
  // silently recomputed just because the page rendered; it's the Date of
  // Joining/Probation Duration onChange handlers further down that
  // explicitly flip this back to false, so THEIR edits (not the initial
  // load) are what triggers a fresh auto-calculation.
  const [probationEndDateTouched, setProbationEndDateTouched] = useState(true);
  useEffect(() => {
    if (employee) {
      setForm({
        employeeCode: employee.employeeCode,
        firstName: employee.firstName, lastName: employee.lastName, email: employee.email,
        department: employee.department || '', designation: employee.designation || '',
        role: employee.role || '', managerId: employee.managerId ? String(employee.managerId) : '',
        verticalId: employee.verticalId ? String(employee.verticalId) : '',
        dateOfJoining: employee.dateOfJoining ? dayjs(employee.dateOfJoining).format('YYYY-MM-DD') : '',
        employmentType: employee.employmentType, panNumber: employee.panNumber || '',
        probationDurationMonths: employee.probationDurationMonths != null ? String(employee.probationDurationMonths) : '',
        probationEndDate: employee.probationEndDate ? dayjs(employee.probationEndDate).format('YYYY-MM-DD') : '',
        uanNumber: employee.uanNumber || '', esicNumber: employee.esicNumber || '',
        bankAccountNumber: employee.bankAccountNumber || '', bankIfsc: employee.bankIfsc || '',
        bankAccountHolder: employee.bankAccountHolder || '', bankName: employee.bankName || '',
        taxRegime: employee.taxRegime, pfApplicable: employee.pfApplicable,
        esiApplicable: employee.esiApplicable, ptApplicable: employee.ptApplicable, status: employee.status,
      });
      setProbationEndDateTouched(true);
    }
  }, [employee]);

  useEffect(() => {
    if (form.employmentType !== 'PROBATION' || probationEndDateTouched) return;
    if (!form.dateOfJoining || !form.probationDurationMonths) return;
    const months = Number(form.probationDurationMonths);
    if (!Number.isFinite(months) || months <= 0) return;
    const computed = dayjs(form.dateOfJoining).add(months, 'month').format('YYYY-MM-DD');
    setForm((f) => (f.probationEndDate === computed ? f : { ...f, probationEndDate: computed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.dateOfJoining, form.probationDurationMonths, form.employmentType, probationEndDateTouched]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch(`/api/payroll/employees/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payroll-employee', id] }); toast.success('Employee profile updated'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const blankAssignForm = { structureId: '', ctcAnnual: '', effectiveFrom: dayjs().format('YYYY-MM-DD'), effectiveTo: '' };
  const [assignForm, setAssignForm] = useState(blankAssignForm);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  const closeAssignForm = () => { setAssignForm(blankAssignForm); setEditingAssignment(null); };
  const openEditAssignment = (a: Assignment) => {
    setEditingAssignment(a);
    setAssignForm({
      structureId: String(a.structure.id),
      ctcAnnual: a.ctcAnnual,
      effectiveFrom: dayjs(a.effectiveFrom).format('YYYY-MM-DD'),
      effectiveTo: a.effectiveTo ? dayjs(a.effectiveTo).format('YYYY-MM-DD') : '',
    });
  };

  const assignMutation = useMutation({
    mutationFn: async (data: typeof assignForm) => {
      const res = await fetch(`/api/payroll/employees/${id}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to assign structure'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-employee', id] });
      toast.success('Salary structure assigned');
      closeAssignForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Structure and effective dates edit directly; the CTC itself only ever
  // changes through reviseMutation below, so a value change always keeps a
  // tracked before/after (see SalaryAssignmentRevision).
  const editAssignmentMutation = useMutation({
    mutationFn: async (data: typeof assignForm) => {
      if (!editingAssignment) throw new Error('No assignment selected');
      const res = await fetch(`/api/payroll/employees/${id}/assignments/${editingAssignment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structureId: data.structureId, effectiveFrom: data.effectiveFrom, effectiveTo: data.effectiveTo || null }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update assignment'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-employee', id] });
      toast.success('Assignment updated');
      closeAssignForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [revisingAssignment, setRevisingAssignment] = useState<Assignment | null>(null);
  const [reviseForm, setReviseForm] = useState({ newCtc: '', reason: '' });
  const reviseMutation = useMutation({
    mutationFn: async () => {
      if (!revisingAssignment) throw new Error('No assignment selected');
      const res = await fetch(`/api/payroll/employees/${id}/assignments/${revisingAssignment.id}/revise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reviseForm),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to revise CTC'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-employee', id] });
      toast.success('CTC revised');
      setRevisingAssignment(null);
      setReviseForm({ newCtc: '', reason: '' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !employee) {
    return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/dashboard/payroll" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-amber-700 mb-2">
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to Employees
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">{employee.firstName} {employee.lastName}</h1>
        <p className="text-slate-500 mt-0.5 text-sm">
          {employee.employeeCode} · {employee.email}{employee.user?.phone ? ` · ${employee.user.phone}` : ''}
          {!employee.user && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-slate-100 text-slate-500">no login</span>}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!String(form.employeeCode || '').trim()) { toast.error('Employee ID cannot be empty'); return; }
              if (form.employmentType === 'PROBATION' && form.dateOfJoining && form.probationEndDate && form.probationEndDate < form.dateOfJoining) {
                toast.error('Probation End Date cannot be earlier than Date of Joining');
                return;
              }
              saveMutation.mutate(form);
            }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-800">HR &amp; Statutory Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Employee ID">
                <input
                  value={form.employeeCode || ''}
                  onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))}
                  className={inputCls}
                  title="Changing this updates the Employee ID everywhere it's shown, including for this person's linked login — it's the same underlying record, not a copy."
                />
              </Field>
              <Field label="First Name"><input value={form.firstName || ''} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className={inputCls} /></Field>
              <Field label="Last Name"><input value={form.lastName || ''} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className={inputCls} /></Field>
              <Field label="Email"><input type="email" value={form.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={inputCls} /></Field>
              <Field label="Department"><input value={form.department || ''} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className={inputCls} /></Field>
              <Field label="Designation"><input value={form.designation || ''} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} className={inputCls} /></Field>
              <Field label="Role"><input value={form.role || ''} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls} /></Field>
              <Field label="Vertical">
                <AddableSelect
                  value={form.verticalId || ''}
                  onChange={(v) => setForm((f) => ({ ...f, verticalId: v }))}
                  options={verticalOptions.map((v) => ({ value: String(v.id), label: v.name }))}
                  placeholder="—"
                />
              </Field>
              <Field label="Manager">
                <AddableSelect
                  value={form.managerId || ''}
                  onChange={(v) => setForm((f) => ({ ...f, managerId: v }))}
                  options={managerOptions.filter((m) => m.id !== employee.id).map((m) => ({ value: String(m.id), label: `${m.firstName} ${m.lastName} (${m.employeeCode})` }))}
                  placeholder="—"
                />
              </Field>
              <Field label="Date of Joining">
                <input
                  type="date"
                  value={form.dateOfJoining || ''}
                  onChange={(e) => { setForm((f) => ({ ...f, dateOfJoining: e.target.value })); setProbationEndDateTouched(false); }}
                  className={inputCls}
                />
              </Field>
              <Field label="Employment Type">
                <AddableSelect
                  value={form.employmentType || 'FULL_TIME'}
                  onChange={(v) => {
                    // Same "clear + fresh calc on re-entering Probation"
                    // convention as the Onboard Employee drawer.
                    setForm((f) => ({ ...f, employmentType: v, ...(v !== 'PROBATION' ? { probationDurationMonths: '', probationEndDate: '' } : {}) }));
                    setProbationEndDateTouched(false);
                  }}
                  options={[
                    { value: 'FULL_TIME', label: 'Full-time' },
                    { value: 'PART_TIME', label: 'Part-time' },
                    { value: 'CONTRACT', label: 'Contract' },
                    { value: 'INTERN', label: 'Intern' },
                    { value: 'PROBATION', label: 'Probation Period' },
                  ]}
                  placeholder="Select employment type"
                />
              </Field>
              {form.employmentType === 'PROBATION' && (
                <>
                  <Field label="Probation Duration (months)">
                    <input
                      type="number" min="1" step="1" placeholder="e.g. 3"
                      value={form.probationDurationMonths || ''}
                      onChange={(e) => { setForm((f) => ({ ...f, probationDurationMonths: e.target.value })); setProbationEndDateTouched(false); }}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Probation End Date">
                    <input
                      type="date"
                      value={form.probationEndDate || ''}
                      onChange={(e) => { setForm((f) => ({ ...f, probationEndDate: e.target.value })); setProbationEndDateTouched(true); }}
                      className={inputCls}
                    />
                    <p className="text-xs text-slate-400 mt-1">Auto-calculated from Date of Joining + Probation Duration — you can override it.</p>
                  </Field>
                </>
              )}
              <Field label="Status">
                <AddableSelect
                  value={form.status || 'ACTIVE'}
                  onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  options={[
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'ON_NOTICE', label: 'On Notice' },
                    { value: 'EXITED', label: 'Exited' },
                  ]}
                  placeholder="Select status"
                />
              </Field>
              <Field label="PAN"><input value={form.panNumber || ''} onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value.toUpperCase() }))} className={inputCls} /></Field>
              <Field label="UAN (PF)"><input value={form.uanNumber || ''} onChange={(e) => setForm((f) => ({ ...f, uanNumber: e.target.value }))} className={inputCls} /></Field>
              <Field label="ESIC Number"><input value={form.esicNumber || ''} onChange={(e) => setForm((f) => ({ ...f, esicNumber: e.target.value }))} className={inputCls} /></Field>
              <Field label="Tax Regime">
                <AddableSelect
                  value={form.taxRegime || 'NEW'}
                  onChange={(v) => setForm((f) => ({ ...f, taxRegime: v }))}
                  options={[
                    { value: 'NEW', label: 'New Regime' },
                    { value: 'OLD', label: 'Old Regime' },
                  ]}
                  placeholder="Select tax regime"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-5 pt-1">
              <Checkbox label="PF applicable" checked={!!form.pfApplicable} onChange={(v) => setForm((f) => ({ ...f, pfApplicable: v }))} />
              <Checkbox label="ESI applicable" checked={!!form.esiApplicable} onChange={(v) => setForm((f) => ({ ...f, esiApplicable: v }))} />
              <Checkbox label="PT applicable" checked={!!form.ptApplicable} onChange={(v) => setForm((f) => ({ ...f, ptApplicable: v }))} />
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-500 uppercase mb-3">Bank details</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Account Holder"><input value={form.bankAccountHolder || ''} onChange={(e) => setForm((f) => ({ ...f, bankAccountHolder: e.target.value }))} className={inputCls} /></Field>
                <Field label="Bank Name"><input value={form.bankName || ''} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} className={inputCls} /></Field>
                <Field label="Account Number"><input value={form.bankAccountNumber || ''} onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} className={inputCls} /></Field>
                <Field label="IFSC"><input value={form.bankIfsc || ''} onChange={(e) => setForm((f) => ({ ...f, bankIfsc: e.target.value.toUpperCase() }))} className={inputCls} /></Field>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-800 mb-3">Salary History</h2>
            {employee.salaryAssignments.length === 0 ? (
              <p className="text-sm text-slate-400">No salary structure assigned yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500 uppercase">
                    <tr><th className="py-1.5 pr-4">Structure</th><th className="py-1.5 pr-4">CTC / yr</th><th className="py-1.5 pr-4">From</th><th className="py-1.5 pr-4">To</th><th className="py-1.5"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employee.salaryAssignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 pr-4 text-slate-700">{a.structure.name}</td>
                        <td className="py-2 pr-4 text-slate-700">₹{Number(a.ctcAnnual).toLocaleString('en-IN')}</td>
                        <td className="py-2 pr-4 text-slate-500">{dayjs(a.effectiveFrom).format('DD MMM YYYY')}</td>
                        <td className="py-2 pr-4 text-slate-500">{a.effectiveTo ? dayjs(a.effectiveTo).format('DD MMM YYYY') : <span className="text-green-600 font-medium">Current</span>}</td>
                        <td className="py-2 text-right whitespace-nowrap">
                          <button onClick={() => openEditAssignment(a)} className="text-xs font-medium text-amber-700 hover:text-amber-800 mr-3">Edit</button>
                          <button onClick={() => { setRevisingAssignment(a); setReviseForm({ newCtc: a.ctcAnnual, reason: '' }); }} className="text-xs font-medium text-slate-500 hover:text-slate-700">Revise CTC</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {revisingAssignment && (
              <form
                onSubmit={(e) => { e.preventDefault(); if (!reviseForm.newCtc) { toast.error('New CTC is required'); return; } reviseMutation.mutate(); }}
                className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3"
              >
                <p className="text-sm font-medium text-slate-700">
                  Revise CTC — {revisingAssignment.structure.name} (currently ₹{Number(revisingAssignment.ctcAnnual).toLocaleString('en-IN')}/yr)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="New Annual CTC (₹)">
                    <input type="number" min="0" step="1000" value={reviseForm.newCtc} onChange={(e) => setReviseForm((f) => ({ ...f, newCtc: e.target.value }))} className={inputCls} />
                  </Field>
                  <Field label="Reason">
                    <input value={reviseForm.reason} onChange={(e) => setReviseForm((f) => ({ ...f, reason: e.target.value }))} className={inputCls} placeholder="e.g. Annual increment" />
                  </Field>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setRevisingAssignment(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                  <button type="submit" disabled={reviseMutation.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                    {reviseMutation.isPending ? 'Saving...' : 'Save Revision'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Same underlying record shows up here (HR/admin view — this
              page also serves as "Payroll Employee") and in My Space >
              My Documents for this employee's own login, if they have
              one — see LegalDocumentsPanel and EmployeeLegalDocument's
              schema comment. canDelete is gated by manage_employees,
              the same permission the rest of this page's edit form
              already requires — no new permission introduced. */}
          <LegalDocumentsPanel
            apiBase={`/api/payroll/employees/${id}/documents`}
            queryKey={`employee-documents-${id}`}
            canUpload={canManageEmployees}
            canDelete={canManageEmployees}
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 h-fit">
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingAssignment ? 'Edit Assignment' : 'Assign Salary Structure'}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!assignForm.structureId || (!editingAssignment && !assignForm.ctcAnnual)) { toast.error('Structure and CTC are required'); return; }
              if (editingAssignment) editAssignmentMutation.mutate(assignForm);
              else assignMutation.mutate(assignForm);
            }}
            className="space-y-3"
          >
            <Field label="Structure">
              <AddableSelect
                value={assignForm.structureId}
                onChange={(v) => setAssignForm((f) => ({ ...f, structureId: v }))}
                options={structures.filter((s) => s.isActive).map((s) => ({ value: String(s.id), label: s.name }))}
                placeholder="Select structure"
              />
            </Field>
            {editingAssignment ? (
              <Field label="Annual CTC (₹)">
                <input value={`₹${Number(assignForm.ctcAnnual).toLocaleString('en-IN')}`} disabled title="Use Revise CTC on the row to change this — it keeps a tracked before/after" className={`${inputCls} bg-slate-50 text-slate-400`} />
              </Field>
            ) : (
              <Field label="Annual CTC (₹)">
                <input type="number" min="0" step="1000" value={assignForm.ctcAnnual} onChange={(e) => setAssignForm((f) => ({ ...f, ctcAnnual: e.target.value }))} className={inputCls} />
              </Field>
            )}
            <Field label="Effective From">
              <input type="date" value={assignForm.effectiveFrom} onChange={(e) => setAssignForm((f) => ({ ...f, effectiveFrom: e.target.value }))} className={inputCls} />
            </Field>
            {editingAssignment && (
              <Field label="Effective To (blank = current)">
                <input type="date" value={assignForm.effectiveTo} onChange={(e) => setAssignForm((f) => ({ ...f, effectiveTo: e.target.value }))} className={inputCls} />
              </Field>
            )}
            <div className="flex gap-2">
              {editingAssignment && (
                <button type="button" onClick={closeAssignForm} className="flex-1 px-4 py-2 min-h-[44px] border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={assignMutation.isPending || editAssignmentMutation.isPending}
                className="flex-1 px-4 py-2 min-h-[44px] bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50"
              >
                {editingAssignment
                  ? (editAssignmentMutation.isPending ? 'Saving...' : 'Save Changes')
                  : (assignMutation.isPending ? 'Assigning...' : 'Assign')}
              </button>
            </div>
            {structures.length === 0 && <p className="text-xs text-slate-400">No salary structures yet — <Link href="/dashboard/payroll/structures" className="text-amber-700 hover:underline">create one first</Link>.</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
      {label}
    </label>
  );
}
