'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

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

interface EmployeeDetail {
  id: number;
  employeeCode: string;
  department: string | null;
  designation: string | null;
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
  employmentType: string;
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
  user: { firstName: string; lastName: string; email: string; phone: string | null };
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

export default function EmployeeDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const queryClient = useQueryClient();

  const { data: employee, isLoading } = useQuery({ queryKey: ['payroll-employee', id], queryFn: () => fetchEmployee(id) });
  const { data: structures = [] } = useQuery({ queryKey: ['payroll-structures'], queryFn: fetchStructures });

  const [form, setForm] = useState<Record<string, any>>({});
  useEffect(() => {
    if (employee) {
      setForm({
        department: employee.department || '', designation: employee.designation || '',
        employmentType: employee.employmentType, panNumber: employee.panNumber || '',
        uanNumber: employee.uanNumber || '', esicNumber: employee.esicNumber || '',
        bankAccountNumber: employee.bankAccountNumber || '', bankIfsc: employee.bankIfsc || '',
        bankAccountHolder: employee.bankAccountHolder || '', bankName: employee.bankName || '',
        taxRegime: employee.taxRegime, pfApplicable: employee.pfApplicable,
        esiApplicable: employee.esiApplicable, ptApplicable: employee.ptApplicable, status: employee.status,
      });
    }
  }, [employee]);

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch(`/api/payroll/employees/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payroll-employee', id] }); toast.success('Employee profile updated'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const [assignForm, setAssignForm] = useState({ structureId: '', ctcAnnual: '', effectiveFrom: dayjs().format('YYYY-MM-DD') });
  const assignMutation = useMutation({
    mutationFn: async (data: typeof assignForm) => {
      const res = await fetch(`/api/payroll/employees/${id}/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to assign structure'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-employee', id] });
      toast.success('Salary structure assigned');
      setAssignForm({ structureId: '', ctcAnnual: '', effectiveFrom: dayjs().format('YYYY-MM-DD') });
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
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">{employee.user.firstName} {employee.user.lastName}</h1>
        <p className="text-slate-500 mt-0.5 text-sm">{employee.employeeCode} · {employee.user.email}{employee.user.phone ? ` · ${employee.user.phone}` : ''}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4"
          >
            <h2 className="text-base font-semibold text-slate-800">HR &amp; Statutory Profile</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Department"><input value={form.department || ''} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className={inputCls} /></Field>
              <Field label="Designation"><input value={form.designation || ''} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} className={inputCls} /></Field>
              <Field label="Employment Type">
                <select value={form.employmentType || 'FULL_TIME'} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))} className={inputCls}>
                  <option value="FULL_TIME">Full-time</option>
                  <option value="PART_TIME">Part-time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status || 'ACTIVE'} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputCls}>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_NOTICE">On Notice</option>
                  <option value="EXITED">Exited</option>
                </select>
              </Field>
              <Field label="PAN"><input value={form.panNumber || ''} onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value.toUpperCase() }))} className={inputCls} /></Field>
              <Field label="UAN (PF)"><input value={form.uanNumber || ''} onChange={(e) => setForm((f) => ({ ...f, uanNumber: e.target.value }))} className={inputCls} /></Field>
              <Field label="ESIC Number"><input value={form.esicNumber || ''} onChange={(e) => setForm((f) => ({ ...f, esicNumber: e.target.value }))} className={inputCls} /></Field>
              <Field label="Tax Regime">
                <select value={form.taxRegime || 'NEW'} onChange={(e) => setForm((f) => ({ ...f, taxRegime: e.target.value }))} className={inputCls}>
                  <option value="NEW">New Regime</option>
                  <option value="OLD">Old Regime</option>
                </select>
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
                    <tr><th className="py-1.5 pr-4">Structure</th><th className="py-1.5 pr-4">CTC / yr</th><th className="py-1.5 pr-4">From</th><th className="py-1.5">To</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employee.salaryAssignments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 pr-4 text-slate-700">{a.structure.name}</td>
                        <td className="py-2 pr-4 text-slate-700">₹{Number(a.ctcAnnual).toLocaleString('en-IN')}</td>
                        <td className="py-2 pr-4 text-slate-500">{dayjs(a.effectiveFrom).format('DD MMM YYYY')}</td>
                        <td className="py-2 text-slate-500">{a.effectiveTo ? dayjs(a.effectiveTo).format('DD MMM YYYY') : <span className="text-green-600 font-medium">Current</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 h-fit">
          <h2 className="text-base font-semibold text-slate-800 mb-3">Assign Salary Structure</h2>
          <form onSubmit={(e) => { e.preventDefault(); if (!assignForm.structureId || !assignForm.ctcAnnual) { toast.error('Structure and CTC are required'); return; } assignMutation.mutate(assignForm); }} className="space-y-3">
            <Field label="Structure">
              <select value={assignForm.structureId} onChange={(e) => setAssignForm((f) => ({ ...f, structureId: e.target.value }))} className={inputCls}>
                <option value="">Select structure</option>
                {structures.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Annual CTC (₹)">
              <input type="number" min="0" step="1000" value={assignForm.ctcAnnual} onChange={(e) => setAssignForm((f) => ({ ...f, ctcAnnual: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Effective From">
              <input type="date" value={assignForm.effectiveFrom} onChange={(e) => setAssignForm((f) => ({ ...f, effectiveFrom: e.target.value }))} className={inputCls} />
            </Field>
            <button type="submit" disabled={assignMutation.isPending} className="w-full px-4 py-2 min-h-[44px] bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50">
              {assignMutation.isPending ? 'Assigning...' : 'Assign'}
            </button>
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
