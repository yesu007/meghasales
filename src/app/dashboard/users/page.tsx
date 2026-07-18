'use client';

import { useState, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  InboxIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowsUpDownIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

// Title-cases a SNAKE_CASE role name for display, e.g. BUSINESS_ANALYST -> "Business Analyst"
function roleLabel(name: string): string {
  return name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

interface RoleOption {
  id: number;
  name: string;
}

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roleId: number;
  roleName: string;
}

async function fetchUsers(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/users?${query}`);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

async function fetchRoles(): Promise<RoleOption[]> {
  const res = await fetch('/api/roles');
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json();
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const size = 10;

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params: Record<string, string> = { page: String(page), size: String(size), sortBy, sortDir };
  if (search) params.search = search;
  if (roleFilter) params.roleId = roleFilter;
  if (activeFilter) params.isActive = activeFilter;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', params],
    queryFn: () => fetchUsers(params),
    placeholderData: (prev: any) => prev,
  });

  const { data: roles = [], isError: isRolesError } = useQuery<RoleOption[]>({
    queryKey: ['roles'],
    queryFn: fetchRoles,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load users');
  }, [isError]);

  useEffect(() => {
    if (isRolesError) toast.error('Failed to load roles');
  }, [isRolesError]);

  const blankForm = { firstName: '', lastName: '', email: '', phone: '', password: '', roleId: '' };
  const [form, setForm] = useState(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankForm); setFormErrors({}); };

  const validateForm = (data: typeof form) => {
    const errs: Record<string, string> = {};
    if (!data.firstName) errs.firstName = 'First name is required';
    if (!data.lastName) errs.lastName = 'Last name is required';
    if (!data.email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errs.email = 'Enter a valid email address';
    if (!editingId && !data.password) errs.password = 'Password is required';
    else if (data.password && data.password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!data.roleId) errs.roleId = 'Role is required';
    return errs;
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editingId ? `/api/users/${editingId}` : '/api/users';
      const method = editingId ? 'PUT' : 'POST';
      // Don't send an empty password on edit — omitting it leaves the existing password unchanged
      const body: Record<string, any> = { ...data };
      if (editingId && !body.password) delete body.password;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || (editingId ? 'Failed to update user' : 'Failed to create user'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(editingId ? 'User updated successfully!' : 'User created successfully!');
      closeDrawer();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEdit = (user: User) => {
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || '',
      password: '',
      roleId: String(user.roleId),
    });
    setEditingId(user.id);
    setDrawerOpen(true);
  };

  const deleteUser = async (id: number, name: string) => {
    if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete user'); return; }
    queryClient.invalidateQueries({ queryKey: ['users'] });
    toast.success('User deleted');
  };

  const toggleActive = async (id: number, isActive: boolean) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    if (!res.ok) { toast.error('Failed to update user status'); return; }
    queryClient.invalidateQueries({ queryKey: ['users'] });
    toast.success(`User ${!isActive ? 'activated' : 'deactivated'}`);
  };

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
    setPage(0);
  };

  const users: User[] = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 0;

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowsUpDownIcon className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3 text-amber-600" /> : <ChevronDownIcon className="h-3 w-3 text-amber-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-slate-500 mt-1">Manage user accounts and access</p>
        </div>
        <button onClick={() => { setEditingId(null); setForm(blankForm); setDrawerOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> Add User
        </button>
      </div>

      {/* Search & Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
            {searchInput && (
              <button onClick={() => { setSearchInput(''); setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Roles</option>
            {roles.map(r => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
          </select>
          <select
            value={activeFilter}
            onChange={(e) => { setActiveFilter(e.target.value); setPage(0); }}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
          {(searchInput || roleFilter || activeFilter) && (
            <button onClick={() => { setSearchInput(''); setSearch(''); setRoleFilter(''); setActiveFilter(''); setPage(0); }} className="text-sm text-slate-500 hover:text-red-500">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No users found</p>
            <p className="text-sm text-slate-400 mt-1">Add a user to get started</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('firstName')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Name <SortIcon col="firstName" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left">
                      <button onClick={() => handleSort('email')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Email <SortIcon col="email" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden md:table-cell">Phone</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Role</th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                    <th className="px-4 py-3 text-left hidden lg:table-cell">
                      <button onClick={() => handleSort('lastLoginAt')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Last Login <SortIcon col="lastLoginAt" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 hidden lg:table-cell">
                      <button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 font-semibold text-slate-700">
                        Created <SortIcon col="createdAt" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold">
                            {user.firstName[0]}{user.lastName[0]}
                          </div>
                          <span className="font-medium text-slate-800">{user.fullName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{user.email}</td>
                      <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{user.phone || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                          {user.roleName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActive(user.id, user.isActive)}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                        {user.lastLoginAt ? dayjs(user.lastLoginAt).format('DD MMM, h:mm A') : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                        {dayjs(user.createdAt).format('DD MMM YYYY')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(user)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteUser(user.id, user.fullName)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <p className="text-sm text-slate-500">
                Showing {page * size + 1}–{Math.min((page + 1) * size, totalElements)} of {totalElements}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
                  <ChevronLeftIcon className="h-4 w-4 text-slate-600" />
                </button>
                <span className="text-sm font-medium text-slate-700">{page + 1} / {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40">
                  <ChevronRightIcon className="h-4 w-4 text-slate-600" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit User Drawer */}
      <Transition appear show={drawerOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeDrawer}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                <Dialog.Panel className="w-screen max-w-lg">
                  <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                      <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit User' : 'Add New User'}</Dialog.Title>
                      <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const errs = validateForm(form);
                        setFormErrors(errs);
                        if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                        saveMutation.mutate(form);
                      }}
                      className="flex-1 px-6 py-4 space-y-4"
                    >
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                            <input
                              value={form.firstName}
                              onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))}
                              className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.firstName ? 'border-red-400' : 'border-slate-300'}`}
                            />
                            {formErrors.firstName && <p className="text-xs text-red-600 mt-1">{formErrors.firstName}</p>}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                            <input
                              value={form.lastName}
                              onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))}
                              className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.lastName ? 'border-red-400' : 'border-slate-300'}`}
                            />
                            {formErrors.lastName && <p className="text-xs text-red-600 mt-1">{formErrors.lastName}</p>}
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                          <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.email ? 'border-red-400' : 'border-slate-300'}`}
                          />
                          {formErrors.email && <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                          <input
                            value={form.phone}
                            onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Password {editingId ? '' : '*'}</label>
                          <input
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.password ? 'border-red-400' : 'border-slate-300'}`}
                            placeholder={editingId ? 'Leave blank to keep current password' : 'Min 8 characters'}
                          />
                          {formErrors.password && <p className="text-xs text-red-600 mt-1">{formErrors.password}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
                          <select
                            value={form.roleId}
                            onChange={(e) => setForm(f => ({ ...f, roleId: e.target.value }))}
                            className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.roleId ? 'border-red-400' : 'border-slate-300'}`}
                          >
                            <option value="">Select role</option>
                            {roles.map(r => <option key={r.id} value={r.id}>{roleLabel(r.name)}</option>)}
                          </select>
                          {formErrors.roleId && <p className="text-xs text-red-600 mt-1">{formErrors.roleId}</p>}
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={closeDrawer} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                          Cancel
                        </button>
                        <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                          {saveMutation.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create User'}
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
