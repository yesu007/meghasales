'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface StageRow {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchStages(): Promise<StageRow[]> {
  const res = await fetch('/api/stages?includeInactive=true');
  if (!res.ok) throw new Error('Failed to fetch stages');
  return res.json();
}

// No separate `code` field anywhere in this form — code always mirrors
// name, kept in sync server-side on both create and update (see POST/PATCH
// /api/stages).
const blankForm = { name: '' };

// Mirrors src/app/dashboard/lead-sources/page.tsx exactly (same layout,
// search, form, table, delete-confirmation and reactivate pattern) — see
// that page for the reference this was built from, per the Stages Master
// requirement ("use Lead Source Master as the exact reference").
export default function StagesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blankForm);

  // Search — same debounced searchInput/search pattern as Lead Sources,
  // applied client-side since this list has no server-side pagination to
  // re-fetch against.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stages = [], isLoading } = useQuery({ queryKey: ['stages-admin'], queryFn: fetchStages });
  const filteredStages = search
    ? stages.filter((s) => {
        const term = search.trim().toLowerCase();
        return s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term);
      })
    : stages;

  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(blankForm); };

  const openEdit = (s: StageRow) => {
    setEditingId(s.id);
    setForm({ name: s.name });
    setShowForm(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const url = editingId ? `/api/stages/${editingId}` : '/api/stages';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save stage'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stages-admin'] }); queryClient.invalidateQueries({ queryKey: ['stages'] }); toast.success(editingId ? 'Stage updated' : 'Stage created'); closeForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = isActive
        ? await fetch(`/api/stages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: true }) })
        : await fetch(`/api/stages/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update stage'); }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stages-admin'] });
      queryClient.invalidateQueries({ queryKey: ['stages'] });
      toast.success(variables.isActive ? 'Stage reactivated' : 'Stage deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Stages</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Implementation stages used by the Customer and Implementation modules</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> Add Stage
        </button>
      </div>

      {/* Search — same bordered-card placement above the table as Lead Sources. */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by stage name..."
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
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) { toast.error('Stage name is required'); return; } save.mutate(); }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingId ? 'Edit Stage' : 'New Stage'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Stage Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Go-Live" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={save.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {save.isPending ? 'Saving...' : editingId ? 'Save Changes' : 'Create Stage'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : stages.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No stages created yet</p>
        ) : filteredStages.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-medium text-slate-600">No stages found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Stage</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredStages.map((s, idx) => (
                  <tr key={s.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{s.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.isActive ? 'Active' : 'Deleted'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(s)} className="text-xs font-medium text-slate-500 hover:text-slate-800">Edit</button>
                        {s.isActive ? (
                          <button
                            onClick={() => { if (window.confirm(`Delete stage "${s.name}"?`)) toggleActive.mutate({ id: s.id, isActive: false }); }}
                            className="text-xs font-medium text-slate-500 hover:text-red-600"
                          >
                            Delete
                          </button>
                        ) : (
                          <button onClick={() => toggleActive.mutate({ id: s.id, isActive: true })} className="text-xs font-medium text-green-700 hover:text-green-800">
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
