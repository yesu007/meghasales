'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface CompanyRow {
  id: number;
  name: string;
  notes: string | null;
  isActive: boolean;
  legalEntities: { id: number; countryId: number }[];
  _count: { leads: number };
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchCompanies(search: string): Promise<CompanyRow[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const res = await fetch(`/api/companies?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch companies');
  return res.json();
}

const blankForm = { name: '', notes: '' };

export default function CompaniesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);

  const { data: companies = [], isLoading } = useQuery({ queryKey: ['companies', search], queryFn: () => fetchCompanies(search) });

  const closeForm = () => { setShowForm(false); setForm(blankForm); };

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create company'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['companies'] }); toast.success('Company created'); closeForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/companies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to update company'); }
      return res.json();
    },
    onSuccess: (_data, variables) => { queryClient.invalidateQueries({ queryKey: ['companies'] }); toast.success(variables.isActive ? 'Company reactivated' : 'Company deactivated'); },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Companies</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Customer company master — one company, one legal entity per country it&apos;s registered in</p>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : setShowForm(true))}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <PlusIcon className="h-4 w-4" /> New Company
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) { toast.error('Company name is required'); return; } create.mutate(); }}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5"
        >
          <h2 className="text-base font-semibold text-slate-800 mb-3">New Company</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="e.g. Tekfilo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-2">Add legal entities (one per country registration) from the company&apos;s detail page after creating it.</p>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={closeForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            <button type="submit" disabled={create.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {create.isPending ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies..."
            className="w-full sm:w-64 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-700 focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
        ) : companies.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No companies created yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Company</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Legal Entities</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Leads/Customers</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c, idx) => (
                  <tr key={c.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/companies/${c.id}`} className="font-medium text-amber-700 hover:text-amber-800">{c.name}</Link>
                      {c.notes && <p className="text-xs text-slate-400">{c.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.legalEntities.length} {c.legalEntities.length === 1 ? 'entity' : 'entities'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{c._count.leads}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/dashboard/companies/${c.id}`} className="text-xs font-medium text-amber-700 hover:text-amber-800">Manage</Link>
                        <button onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                          {c.isActive ? 'Deactivate' : 'Reactivate'}
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
    </div>
  );
}
