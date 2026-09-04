'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { STATUS_COLOR_PRESETS } from '@/lib/leadStatus';

interface LeadStatusOptionRow {
  id: number;
  code: string;
  label: string;
  color: string;
  sortOrder: number;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchLeadStatusOptions(): Promise<LeadStatusOptionRow[]> {
  const res = await fetch('/api/lead-status-options');
  if (!res.ok) throw new Error('Failed to fetch lead status options');
  return res.json();
}

// Deliberately no "New Status" button and no delete action — these 6 rows
// are the fixed lead pipeline stages code branches on by exact value (see
// the LeadStatusOption model comment in schema.prisma). Only label, color,
// and display order are editable here.
export default function LeadStatusesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ label: '', color: '', sortOrder: 0 });

  // Search — same debounced searchInput/search pattern as the Leads module
  // (src/app/dashboard/leads/page.tsx), but applied client-side since this
  // list has no server-side pagination to re-fetch against.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: options = [], isLoading } = useQuery({ queryKey: ['lead-status-options-admin'], queryFn: fetchLeadStatusOptions });
  const filteredOptions = search
    ? options.filter((o) => {
        const term = search.trim().toLowerCase();
        return o.label.toLowerCase().includes(term) || o.code.toLowerCase().includes(term);
      })
    : options;

  const openEdit = (o: LeadStatusOptionRow) => {
    setEditingId(o.id);
    setForm({ label: o.label, color: o.color, sortOrder: o.sortOrder });
  };

  const closeForm = () => setEditingId(null);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/lead-status-options/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save status'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-status-options-admin'] });
      queryClient.invalidateQueries({ queryKey: ['lead-status-options'] });
      toast.success('Status updated');
      closeForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Lead Statuses</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Label, color, and display order for the lead pipeline — the 6 stages themselves are fixed</p>
      </div>

      {/* Search — same bordered-card placement above the table as Leads. */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by label, stage..."
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : filteredOptions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-medium text-slate-600">No statuses found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Label</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Color</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Order</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredOptions.map((o, idx) => (
                  <tr key={o.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    {editingId === o.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className={inputCls} />
                        </td>
                        <td className="px-4 py-3">
                          <select value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className={inputCls}>
                            {STATUS_COLOR_PRESETS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} className={`${inputCls} w-20`} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={closeForm} className="text-xs font-medium text-slate-500 hover:text-slate-800">Cancel</button>
                            <button onClick={() => save.mutate()} disabled={save.isPending} className="text-xs font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50">
                              {save.isPending ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${o.color}`}>{o.label}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{STATUS_COLOR_PRESETS.find((c) => c.value === o.color)?.label || o.color}</td>
                        <td className="px-4 py-3 text-slate-600">{o.sortOrder}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => openEdit(o)} className="text-xs font-medium text-slate-500 hover:text-slate-800">Edit</button>
                        </td>
                      </>
                    )}
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
