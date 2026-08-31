'use client';

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import { PlusIcon, XMarkIcon, InboxIcon, PencilIcon, TrashIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface EmployeeRow {
  id: number;
  employeeCode: string;
  userName: string;
  userEmail: string;
  hasLogin: boolean;
  department: string | null;
  designation: string | null;
  role: string | null;
  employmentType: string;
  status: string;
  manager: { id: number; firstName: string; lastName: string } | null;
  vertical: { id: number; name: string } | null;
  currentStructureName: string | null;
  currentCtcAnnual: string | null;
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

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  ON_NOTICE: 'bg-amber-100 text-amber-700',
  EXITED: 'bg-slate-100 text-slate-500',
};

interface EmployeesResponse {
  content: EmployeeRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

async function fetchEmployees(search: string, page: number, size: number): Promise<EmployeesResponse> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (search) params.set('search', search);
  const res = await fetch(`/api/payroll/employees?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch employees');
  return res.json();
}

// Page numbers with ellipsis, e.g. 1 2 3 4 … 10
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  if (current <= 3) return [0, 1, 2, 3, 'ellipsis', total - 1];
  if (current >= total - 4) return [0, 'ellipsis', total - 4, total - 3, total - 2, total - 1];
  return [0, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total - 1];
}

const blankForm = {
  firstName: '', lastName: '', email: '', department: '', designation: '', role: '', managerId: '', verticalId: '', dateOfJoining: '',
  employmentType: 'FULL_TIME', bankAccountNumber: '', bankIfsc: '', bankAccountHolder: '', bankName: '',
};

export default function PayrollEmployeesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(blankForm);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['payroll-employees', search, page, size],
    queryFn: () => fetchEmployees(search, page, size),
    placeholderData: (prev: any) => prev,
  });

  const { data: managerOptions = [] } = useQuery({
    queryKey: ['payroll-employees-manager-options'],
    queryFn: fetchManagerOptions,
    enabled: drawerOpen,
  });

  const { data: verticalOptions = [] } = useQuery({
    queryKey: ['verticals'],
    queryFn: fetchVerticals,
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
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;
  const pageNumbers = getPageNumbers(page, totalPages || 1);

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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
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
          <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Employee</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden sm:table-cell">Department / Designation</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Salary Structure</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e, idx) => (
                  <tr key={e.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/payroll/${e.id}`} className="font-medium text-slate-800 hover:text-amber-700">{e.userName}</Link>
                      {!e.hasLogin && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-slate-100 text-slate-500" title="No CRM login — payroll-only record">no login</span>}
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span>Rows per page</span>
              <select
                value={size}
                onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }}
                className="px-2 py-1 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Previous
              </button>
              {pageNumbers.map((p, i) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-sm text-slate-400">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[2.5rem] min-h-[40px] px-2 py-1.5 rounded text-sm font-medium ${p === page ? 'bg-amber-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-2 py-1.5 min-h-[44px] rounded text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}</p>
          </div>
          </>
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
                        if (!form.firstName || !form.lastName || !form.email) { toast.error('First name, last name, and email are required'); return; }
                        createMutation.mutate(form);
                      }}
                      className="flex-1 px-6 py-4 space-y-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                          <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                          <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        <p className="text-xs text-slate-400 mt-1">If this matches an existing CRM user&apos;s email, their account is linked automatically — enabling My Payslips/My Leave. Otherwise this is a payroll-only record with no login.</p>
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
                          <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                          <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Vertical</label>
                          <select value={form.verticalId} onChange={(e) => setForm((f) => ({ ...f, verticalId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                            <option value="">—</option>
                            {verticalOptions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Manager</label>
                        <select value={form.managerId} onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                          <option value="">—</option>
                          {managerOptions.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.employeeCode})</option>)}
                        </select>
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
