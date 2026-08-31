'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import CompanyLegalEntityManager from '@/components/companies/CompanyLegalEntityManager';

interface CompanyOption { id: number; name: string }

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function searchCompanies(search: string): Promise<CompanyOption[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const res = await fetch(`/api/companies?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch companies');
  return res.json();
}

// Company is the same customer-facing record as before — there is no
// separate "Companies" menu/section. Linking one (or creating a new one)
// happens right here on the customer's own detail page, and its legal
// entities (address, tax registration, documents) are managed inline too.
export default function CompanyTab({ leadId, company }: { leadId: number; company: { id: number; name: string } | null }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-search', search],
    queryFn: () => searchCompanies(search),
    enabled: showLinkForm,
  });

  const linkCompany = useMutation({
    mutationFn: async (companyId: number) => {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to link company'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] }); toast.success('Company linked'); setShowLinkForm(false); setSearch(''); },
    onError: (err: Error) => toast.error(err.message),
  });

  const createAndLink = useMutation({
    mutationFn: async () => {
      const createRes = await fetch('/api/companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newCompanyName }) });
      if (!createRes.ok) { const err = await createRes.json(); throw new Error(err.message || 'Failed to create company'); }
      const created = await createRes.json();
      const linkRes = await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: created.id }) });
      if (!linkRes.ok) { const err = await linkRes.json(); throw new Error(err.message || 'Failed to link company'); }
      return linkRes.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] }); toast.success('Company created and linked'); setShowLinkForm(false); setNewCompanyName(''); },
    onError: (err: Error) => toast.error(err.message),
  });

  const unlinkCompany = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: null }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to unlink company'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lead', String(leadId)] }); toast.success('Company unlinked'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!company) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        {!showLinkForm ? (
          <div className="text-center py-8">
            <p className="text-slate-600 font-medium mb-1">No company linked yet</p>
            <p className="text-sm text-slate-400 mb-4">Link this customer to a Company to manage its per-country legal entities, addresses, tax registration, and documents.</p>
            <button onClick={() => setShowLinkForm(true)} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">Link a Company</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Search existing companies</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type a company name..." className={inputCls} />
              {search && (
                <div className="mt-2 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {companies.length === 0 ? (
                    <p className="text-sm text-slate-400 px-3 py-3">No matching companies</p>
                  ) : (
                    companies.map((c) => (
                      <button key={c.id} onClick={() => linkCompany.mutate(c.id)} disabled={linkCompany.isPending} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-amber-50">
                        {c.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-1">Or create a new company</label>
              <div className="flex gap-2">
                <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company name" className={inputCls} />
                <button
                  onClick={() => { if (!newCompanyName.trim()) { toast.error('Company name is required'); return; } createAndLink.mutate(); }}
                  disabled={createAndLink.isPending}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {createAndLink.isPending ? 'Creating...' : 'Create & Link'}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setShowLinkForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase">Linked Company</p>
          <p className="text-lg font-semibold text-slate-800">{company.name}</p>
        </div>
        <button onClick={() => { if (window.confirm(`Unlink "${company.name}" from this customer?`)) unlinkCompany.mutate(); }} className="text-xs font-medium text-slate-500 hover:text-red-600">
          Unlink
        </button>
      </div>
      <CompanyLegalEntityManager companyId={company.id} />
    </div>
  );
}
