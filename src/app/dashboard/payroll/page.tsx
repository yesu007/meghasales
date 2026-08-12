'use client';

import { useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import { PlusIcon, XMarkIcon, InboxIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface EligibleUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface EmployeeRow {
  id: number;
  employeeCode: string;
  userName: string;
  userEmail: string;
  department: string | null;
  designation: string | null;
  employmentType: string;
  status: string;
  currentStructureName: string | null;
  currentCtcAnnual: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_NOTICE: 'bg-amber-100 text-amber-700',
  EXITED: 'bg-slate-100 text-slate-500',
};

async function fetchEmployees(search: string): Promise<{ content: EmployeeRow[] }> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const res = await fetch(`/api/payroll/employees?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch employees');
  return res.json();
}

async function fetchEligibleUsers(): Promise<EligibleUser[]> {
  const res = await fetch('/api/payroll/employees/eligible-users');
  if (!res.ok) throw new Error('Failed to fetch eligible users');
  return res.json();
}

const blankForm = {
  userId: '', department: '', designation: '', dateOfJoining: '',
  employmentType: 'FULL_TIME', bankAccountNumber: '', bankIfsc: '', bankAccountHolder: '', bankName: '',
};

export default function PayrollEmployeesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payroll-employees', search],
    queryFn: () => fetchEmployees(search),
  });

  const { data: eligibleUsers = [] } = useQuery({
    queryKey: ['payroll-eligible-users'],
    queryFn: fetchEligibleUsers,
    enabled: drawerOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof form) => {
      const res = await fetch('/api/payroll/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to onboard employee');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-employees'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-eligible-users'] });
      toast.success('Employee onboarded to payroll');
      setDrawerOpen(false);
      setForm(blankForm);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/employees/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to delete employee');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payroll-employees'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-eligible-users'] });
      toast.success('Employee removed from payroll');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDelete = (emp: EmployeeRow) => {
    if (window.confirm(`Remove ${emp.userName} (${emp.employeeCode}) from payroll? This cannot be undone.`)) {
      deleteMutation.mutate(emp.id);
    }
  };

  const employees = data?.content || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Payroll — Employees</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Onboard employees and manage their HR &amp; bank details</p>
        </div>
        <button onClick={() => setDrawerOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 self-start sm:self-auto">
          <PlusIcon className="h-4 w-4" /> Onboard Employee
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <input
          type="text"
          placeholder="Search by name, employee code, department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
          </div>
        ) : isError ? (
          <p className="text-center py-16 text-sm text-red-600">Failed to load employees</p>
        ) : employees.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No employees yet</p>
            <p className="text-sm text-slate-400 mt-1">Onboard a user to start building payroll</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden sm:table-cell">Department / Designation</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden md:table-cell">Salary Structure</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/payroll/${e.id}`} className="font-medium text-slate-800 hover:text-amber-700">{e.userName}</Link>
                      <div className="text-xs text-slate-400 mono">{e.employeeCode} · {e.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{[e.designation, e.department].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                      {e.currentStructureName ? (
                        <span>{e.currentStructureName} <span className="text-slate-400">· ₹{Number(e.currentCtcAnnual).toLocaleString('en-IN')}/yr</span></span>
                      ) : <span className="text-slate-400">Not assigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[e.status] || 'bg-slate-100 text-slate-600'}`}>{e.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => router.push(`/dashboard/payroll/${e.id}`)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(e)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Transition appear show={drawerOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setDrawerOpen(false)}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                <Dialog.Panel className="w-screen max-w-lg">
                  <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                      <Dialog.Title className="text-lg font-semibold text-slate-800">Onboard Employee</Dialog.Title>
                      <button onClick={() => setDrawerOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!form.userId) { toast.error('Select a user'); return; }
                        createMutation.mutate(form);
                      }}
                      className="flex-1 px-6 py-4 space-y-4"
                    >
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">User *</label>
                        <select
                          value={form.userId}
                          onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="">Select a user without a payroll profile</option>
                          {eligibleUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.firstName} {u.lastName} — {u.email}</option>
                          ))}
                        </select>
                        {eligibleUsers.length === 0 && <p className="text-xs text-slate-400 mt-1">Every active user already has a payroll profile.</p>}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                          <input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                          <input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Date of Joining</label>
                          <input type="date" value={form.dateOfJoining} onChange={(e) => setForm((f) => ({ ...f, dateOfJoining: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Employment Type</label>
                          <select value={form.employmentType} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                            <option value="FULL_TIME">Full-time</option>
                            <option value="PART_TIME">Part-time</option>
                            <option value="CONTRACT">Contract</option>
                            <option value="INTERN">Intern</option>
                          </select>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs font-medium text-slate-500 uppercase mb-3">Bank details</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Account Holder Name</label>
                            <input value={form.bankAccountHolder} onChange={(e) => setForm((f) => ({ ...f, bankAccountHolder: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
                            <input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                            <input value={form.bankAccountNumber} onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">IFSC</label>
                            <input value={form.bankIfsc} onChange={(e) => setForm((f) => ({ ...f, bankIfsc: e.target.value.toUpperCase() }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={() => setDrawerOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                        <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                          {createMutation.isPending ? 'Saving...' : 'Onboard Employee'}
                        </button>
                      </div>
                    </form>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}
