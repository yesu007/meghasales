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
  page: string | null;
  action: string | null;
  description: string | null;
}

const ACTION_COLUMNS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
] as const;

interface PageRow {
  page: string;
  cells: Partial<Record<string, Permission>>;
  extra: Permission[];
}

// Module → Page → View/Create/Edit/Delete, in catalog order (the API sorts
// by sortOrder; see src/lib/permissionCatalog.ts). Permissions without a
// page — custom ones added below — are listed per module under "Other".
function buildMatrix(permissions: Permission[]) {
  const modules: { module: string; pages: PageRow[] }[] = [];
  const other: Record<string, Permission[]> = {};
  for (const p of permissions) {
    if (!p.page) { (other[p.module] ||= []).push(p); continue; }
    let mod = modules.find((m) => m.module === p.module);
    if (!mod) { mod = { module: p.module, pages: [] }; modules.push(mod); }
    let row = mod.pages.find((r) => r.page === p.page);
    if (!row) { row = { page: p.page, cells: {}, extra: [] }; mod.pages.push(row); }
    if (p.action && p.action !== 'other') row.cells[p.action] = p;
    else row.extra.push(p);
  }
  return { modules, other };
}

// "manage_own_action_items" → "Manage own action items"
function permissionLabel(p: Permission): string {
  const text = p.name.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
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
  const canCreateRoles = has('create_roles');
  const canEditRoles = has('edit_roles');
  const canDeleteRoles = has('delete_roles');

  const { data: roles = [], isLoading, isError } = useQuery({ queryKey: ['roles'], queryFn: fetchRoles });
  // Only fetched for users who can actually open the permission matrix
  // (create or edit a role).
  const { data: permissions = [] } = useQuery({ queryKey: ['permissions'], queryFn: fetchPermissions, enabled: canCreateRoles || canEditRoles });
  const matrix = buildMatrix(permissions);

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
    // Guards against a still-open drawer's stale validation messages from a
    // previous failed create attempt bleeding into this edit — closeDrawer
    // already clears this on the normal Cancel/X path, this is just defense
    // in depth.
    setFormErrors({});
    setDrawerOpen(true);
  };

  const setPermissions = (ids: number[], on: boolean) => {
    setForm((f) => ({
      ...f,
      permissionIds: on ? Array.from(new Set([...f.permissionIds, ...ids])) : f.permissionIds.filter((pid) => !ids.includes(pid)),
    }));
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
        {canCreateRoles && (
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
                      {canEditRoles || canDeleteRoles ? (
                        <div className="flex items-center justify-end gap-1">
                          {canEditRoles && (
                            <button onClick={() => openEdit(role)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                          {canDeleteRoles && (
                            <button onClick={() => deleteRole(role.id, role.name)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
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
                <Dialog.Panel className="w-screen max-w-3xl">
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
                          onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value.toUpperCase().replace(/\s+/g, '_') })); setFormErrors((fe) => ('name' in fe ? Object.fromEntries(Object.entries(fe).filter(([k]) => k !== 'name')) : fe)); }}
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
                        <div className="max-h-[28rem] overflow-y-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-slate-50">
                              <tr className="border-b border-slate-200">
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Module / Page</th>
                                {ACTION_COLUMNS.map((c) => (
                                  <th key={c.key} className="px-2 py-2 text-center font-semibold text-slate-600 w-16">{c.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {matrix.modules.map(({ module, pages }) => (
                                <Fragment key={module}>
                                  <tr className="bg-slate-100/70">
                                    <td colSpan={ACTION_COLUMNS.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{module}</td>
                                  </tr>
                                  {pages.map((row) => {
                                    const rowIds = [...Object.values(row.cells), ...row.extra].map((p) => p!.id);
                                    const allOn = rowIds.every((id) => form.permissionIds.includes(id));
                                    return (
                                      <tr key={row.page} className="border-b border-slate-100 align-top">
                                        <td className="px-3 py-2">
                                          <label className="flex items-center gap-2 font-medium text-slate-700">
                                            <input
                                              type="checkbox"
                                              checked={allOn}
                                              onChange={() => setPermissions(rowIds, !allOn)}
                                              title="Select all for this page"
                                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                            />
                                            {row.page}
                                          </label>
                                          {row.extra.length > 0 && (
                                            <div className="mt-1.5 ml-6 flex flex-wrap gap-x-4 gap-y-1">
                                              {row.extra.map((p) => (
                                                <label key={p.id} className="flex items-center gap-1.5 text-xs text-slate-600" title={p.description || p.name}>
                                                  <input
                                                    type="checkbox"
                                                    checked={form.permissionIds.includes(p.id)}
                                                    onChange={() => togglePermission(p.id)}
                                                    className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                                  />
                                                  {permissionLabel(p)}
                                                </label>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                        {ACTION_COLUMNS.map((c) => {
                                          const p = row.cells[c.key];
                                          return (
                                            <td key={c.key} className="px-2 py-2 text-center">
                                              {p ? (
                                                <input
                                                  type="checkbox"
                                                  checked={form.permissionIds.includes(p.id)}
                                                  onChange={() => togglePermission(p.id)}
                                                  title={p.description || p.name}
                                                  aria-label={`${row.page} ${c.label}`}
                                                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                                />
                                              ) : (
                                                <span className="text-slate-300">—</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </Fragment>
                              ))}
                              {Object.keys(matrix.other).length > 0 && (
                                <tr className="bg-slate-100/70">
                                  <td colSpan={ACTION_COLUMNS.length + 1} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Other permissions</td>
                                </tr>
                              )}
                              {Object.keys(matrix.other).sort().map((module) => (
                                <tr key={`other-${module}`} className="border-b border-slate-100">
                                  <td colSpan={ACTION_COLUMNS.length + 1} className="px-3 py-2">
                                    <p className="text-xs font-medium text-slate-500 mb-1">{module}</p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                      {matrix.other[module].map((p) => (
                                        <label key={p.id} className="flex items-center gap-1.5 text-xs text-slate-600" title={p.description || ''}>
                                          <input
                                            type="checkbox"
                                            checked={form.permissionIds.includes(p.id)}
                                            onChange={() => togglePermission(p.id)}
                                            className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                          />
                                          {p.name}
                                        </label>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {permissions.length === 0 && <p className="text-sm text-slate-400 p-3">No permissions yet — add one below.</p>}
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">Without View, a page is hidden from the sidebar and can&apos;t be opened, even if Create or Edit is ticked.</p>
                      </div>

                      {/* Define a brand-new permission string and drop it straight into
                          the matrix above. It only takes effect once a route in code
                          calls requirePermission() with this exact name — this just
                          makes it assignable. */}
                      {canCreateRoles && (
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
                      )}

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
