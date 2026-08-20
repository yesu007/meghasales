'use client';

import { useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, Transition } from '@headlessui/react';
import { PlusIcon, XMarkIcon, InboxIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/usePermissions';

function roleLabel(name: string): string {
  return name.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
}

interface Permission {
  id: number;
  name: string;
  module: string;
  description: string | null;
}

interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  userCount: number;
  permissions: Permission[];
}

async function fetchRoles(): Promise<RoleRow[]> {
  const res = await fetch('/api/roles');
  if (!res.ok) throw new Error('Failed to fetch roles');
  return res.json();
}

async function fetchPermissions(): Promise<Permission[]> {
  const res = await fetch('/api/permissions');
  if (!res.ok) throw new Error('Failed to fetch permissions');
  return res.json();
}

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canManageRoles = has('manage_roles');

  const { data: roles = [], isLoading, isError } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });
  // Only fetched for users who can actually edit the permission matrix —
  // /api/permissions itself requires manage_roles, so a view-only visitor
  // never needs (or is allowed) to call it.
  const { data: permissions = [] } = useQuery({ queryKey: ['permissions'], queryFn: fetchPermissions, enabled: canManageRoles });

  const permissionsByModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  }, {});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const blankForm = { name: '', description: '', permissionIds: [] as number[] };
  const [form, setForm] = useState(blankForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [newPerm, setNewPerm] = useState({ name: '', module: '', description: '' });

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(blankForm); setFormErrors({}); setNewPerm({ name: '', module: '', description: '' }); };

  const openCreate = () => { setForm(blankForm); setEditingId(null); setDrawerOpen(true); };
  const openEdit = (role: RoleRow) => {
    setForm({ name: role.name, description: role.description || '', permissionIds: role.permissions.map((p) => p.id) });
    setEditingId(role.id);
    setDrawerOpen(true);
  };

  const togglePermission = (id: number) => {
    setForm((f) => ({
      ...f,
      permissionIds: f.permissionIds.includes(id) ? f.permissionIds.filter((pid) => pid !== id) : [...f.permissionIds, id],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const url = editingId ? `/api/roles/${editingId}` : '/api/roles';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to save role');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      toast.success(editingId ? 'Role updated' : 'Role created');
      closeDrawer();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createPermissionMutation = useMutation({
    mutationFn: async (data: typeof newPerm) => {
      const res = await fetch('/api/permissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create permission');
      }
      return res.json();
    },
    onSuccess: (created: Permission) => {
      queryClient.invalidateQueries({ queryKey: ['permissions'] });
      setForm((f) => ({ ...f, permissionIds: [...f.permissionIds, created.id] }));
      setNewPerm({ name: '', module: '', description: '' });
      toast.success(`Permission "${created.name}" created and added`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteRole = async (id: number, name: string) => {
    if (!window.confirm(`Delete role "${roleLabel(name)}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message || 'Failed to delete role');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['roles'] });
    toast.success('Role deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Roles &amp; Permissions</h1>
          <p className="text-slate-500 mt-1">Define what each role can see and do</p>
        </div>
        {canManageRoles && (
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> Add Role
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          </div>
        ) : isError ? (
          <div className="text-center py-16 text-slate-500">Failed to load roles</div>
        ) : roles.length === 0 ? (
          <div className="text-center py-16">
            <InboxIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">No roles found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Description</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Permissions</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Users</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Actions</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role, idx) => (
                  <tr key={role.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3 font-medium text-slate-800">{roleLabel(role.name)}</td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{role.description || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{role.permissions.length}</td>
                    <td className="px-4 py-3 text-slate-600">{role.userCount}</td>
                    <td className="px-4 py-3">
                      {canManageRoles ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(role)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteRole(role.id, role.name)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Role Drawer */}
      <Transition appear show={drawerOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeDrawer}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-black/40" />
          </Transition.Child>
          <div className="fixed inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
                <Dialog.Panel className="w-screen max-w-xl">
                  <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                    <div className="flex items-center justify-between px-6 py-4 border-b">
                      <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Role' : 'Add New Role'}</Dialog.Title>
                      <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const errs: Record<string, string> = {};
                        if (!form.name.trim()) errs.name = 'Role name is required';
                        setFormErrors(errs);
                        if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                        saveMutation.mutate(form);
                      }}
                      className="flex-1 px-6 py-4 space-y-4"
                    >
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Role Name *</label>
                        <input
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                          placeholder="e.g. SUPPORT_LEAD"
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.name ? 'border-red-400' : 'border-slate-300'}`}
                        />
                        {formErrors.name && <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                        <input
                          value={form.description}
                          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
                        <div className="space-y-3 max-h-96 overflow-y-auto border border-slate-200 rounded-lg p-3">
                          {Object.keys(permissionsByModule).sort().map((module) => (
                            <div key={module}>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{module}</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {permissionsByModule[module].map((p) => (
                                  <label key={p.id} className="flex items-start gap-2 text-sm text-slate-700" title={p.description || ''}>
                                    <input
                                      type="checkbox"
                                      checked={form.permissionIds.includes(p.id)}
                                      onChange={() => togglePermission(p.id)}
                                      className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>{p.name}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          {permissions.length === 0 && <p className="text-sm text-slate-400">No permissions yet — add one below.</p>}
                        </div>
                      </div>

                      {/* Define a brand-new permission string and drop it straight into
                          the matrix above. It only takes effect once a route in code
                          calls requirePermission() with this exact name — this just
                          makes it assignable. */}
                      <div className="border border-dashed border-slate-300 rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium text-slate-700">+ New permission</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={newPerm.name}
                            onChange={(e) => setNewPerm((p) => ({ ...p, name: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                            placeholder="permission_name"
                            className="px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          />
                          <input
                            value={newPerm.module}
                            onChange={(e) => setNewPerm((p) => ({ ...p, module: e.target.value.toUpperCase() }))}
                            placeholder="MODULE"
                            className="px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <input
                          value={newPerm.description}
                          onChange={(e) => setNewPerm((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Description (optional)"
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          disabled={!newPerm.name || !newPerm.module || createPermissionMutation.isPending}
                          onClick={() => createPermissionMutation.mutate(newPerm)}
                          className="px-3 py-1.5 bg-slate-700 text-white text-xs font-medium rounded hover:bg-slate-800 disabled:opacity-40"
                        >
                          {createPermissionMutation.isPending ? 'Adding...' : 'Add permission'}
                        </button>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t">
                        <button type="button" onClick={closeDrawer} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
                          Cancel
                        </button>
                        <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                          {saveMutation.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create Role'}
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
