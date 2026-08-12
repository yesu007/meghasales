'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface StatutorySettings {
  pfWageCeiling: string | null;
  pfEmployerRate: string | null;
  esiGrossThreshold: string | null;
  esiEmployerRate: string | null;
  tanNumber: string | null;
  pfEstablishmentCode: string | null;
  esiEstablishmentCode: string | null;
  ptRegistrationNumber: string | null;
}

interface PtSlab {
  id: number;
  state: string;
  minGross: string;
  maxGross: string | null;
  monthlyAmount: string;
  isActive: boolean;
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchSettings(): Promise<StatutorySettings> {
  const res = await fetch('/api/payroll/statutory-settings');
  if (!res.ok) throw new Error('Failed to fetch statutory settings');
  return res.json();
}

async function fetchSlabs(): Promise<PtSlab[]> {
  const res = await fetch('/api/payroll/pt-slabs');
  if (!res.ok) throw new Error('Failed to fetch PT slabs');
  return res.json();
}

export default function StatutorySettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['payroll-statutory-settings'], queryFn: fetchSettings });
  const { data: slabs = [] } = useQuery({ queryKey: ['pt-slabs'], queryFn: fetchSlabs });

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settings) {
      setForm({
        pfWageCeiling: settings.pfWageCeiling ?? '', pfEmployerRate: settings.pfEmployerRate ?? '',
        esiGrossThreshold: settings.esiGrossThreshold ?? '', esiEmployerRate: settings.esiEmployerRate ?? '',
        tanNumber: settings.tanNumber ?? '', pfEstablishmentCode: settings.pfEstablishmentCode ?? '',
        esiEstablishmentCode: settings.esiEstablishmentCode ?? '', ptRegistrationNumber: settings.ptRegistrationNumber ?? '',
      });
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/statutory-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payroll-statutory-settings'] }); toast.success('Statutory settings saved'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const [showSlabForm, setShowSlabForm] = useState(false);
  const [slabForm, setSlabForm] = useState({ state: 'TN', minGross: '', maxGross: '', monthlyAmount: '' });

  const createSlab = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/payroll/pt-slabs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slabForm) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to add slab'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pt-slabs'] }); toast.success('PT slab added'); setSlabForm({ state: 'TN', minGross: '', maxGross: '', monthlyAmount: '' }); setShowSlabForm(false); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleSlab = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/payroll/pt-slabs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error('Failed to update slab');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pt-slabs'] }),
    onError: () => toast.error('Failed to update slab'),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Statutory Settings</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">PF/ESI rates, thresholds, and Professional Tax slabs used by the payroll run engine</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        The Professional Tax slabs below are starting defaults, not a verified current rate card — check them against the latest Tamil Nadu Commercial Taxes Department notification before relying on this for an actual filing.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(); }} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
        <h2 className="text-base font-semibold text-slate-800">PF &amp; ESI</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PF Wage Ceiling (₹/month)</label>
            <input type="number" value={form.pfWageCeiling || ''} onChange={(e) => setForm((f) => ({ ...f, pfWageCeiling: e.target.value }))} placeholder="Leave blank for no ceiling" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PF Employer Rate (%)</label>
            <input type="number" step="0.01" value={form.pfEmployerRate || ''} onChange={(e) => setForm((f) => ({ ...f, pfEmployerRate: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ESI Gross Threshold (₹/month)</label>
            <input type="number" value={form.esiGrossThreshold || ''} onChange={(e) => setForm((f) => ({ ...f, esiGrossThreshold: e.target.value }))} placeholder="Leave blank to never gate ESI" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ESI Employer Rate (%)</label>
            <input type="number" step="0.01" value={form.esiEmployerRate || ''} onChange={(e) => setForm((f) => ({ ...f, esiEmployerRate: e.target.value }))} className={inputCls} />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 uppercase mb-3">Registration numbers (for statutory filings)</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">TAN</label><input value={form.tanNumber || ''} onChange={(e) => setForm((f) => ({ ...f, tanNumber: e.target.value.toUpperCase() }))} className={inputCls} /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">PF Establishment Code</label><input value={form.pfEstablishmentCode || ''} onChange={(e) => setForm((f) => ({ ...f, pfEstablishmentCode: e.target.value }))} className={inputCls} /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">ESI Establishment Code</label><input value={form.esiEstablishmentCode || ''} onChange={(e) => setForm((f) => ({ ...f, esiEstablishmentCode: e.target.value }))} className={inputCls} /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">PT Registration Number</label><input value={form.ptRegistrationNumber || ''} onChange={(e) => setForm((f) => ({ ...f, ptRegistrationNumber: e.target.value }))} className={inputCls} /></div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button type="submit" disabled={saveSettings.isPending} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {saveSettings.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Professional Tax Slabs</h2>
          <button onClick={() => setShowSlabForm((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <PlusIcon className="h-4 w-4" /> Add Slab
          </button>
        </div>

        {showSlabForm && (
          <form onSubmit={(e) => { e.preventDefault(); if (!slabForm.minGross || !slabForm.monthlyAmount) { toast.error('Min gross and monthly amount are required'); return; } createSlab.mutate(); }} className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <input placeholder="State" value={slabForm.state} onChange={(e) => setSlabForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))} className={inputCls} />
            <input type="number" placeholder="Min gross" value={slabForm.minGross} onChange={(e) => setSlabForm((f) => ({ ...f, minGross: e.target.value }))} className={inputCls} />
            <input type="number" placeholder="Max gross (blank = ∞)" value={slabForm.maxGross} onChange={(e) => setSlabForm((f) => ({ ...f, maxGross: e.target.value }))} className={inputCls} />
            <input type="number" placeholder="Monthly PT (₹)" value={slabForm.monthlyAmount} onChange={(e) => setSlabForm((f) => ({ ...f, monthlyAmount: e.target.value }))} className={inputCls} />
            <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowSlabForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={createSlab.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">Add</button>
            </div>
          </form>
        )}

        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 uppercase">
            <tr><th className="py-1.5 pr-4">State</th><th className="py-1.5 pr-4">Gross Range</th><th className="py-1.5 pr-4">Monthly PT</th><th className="py-1.5">Active</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {slabs.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-4 text-slate-700">{s.state}</td>
                <td className="py-2 pr-4 text-slate-600">₹{Number(s.minGross).toLocaleString('en-IN')} – {s.maxGross ? `₹${Number(s.maxGross).toLocaleString('en-IN')}` : '∞'}</td>
                <td className="py-2 pr-4 text-slate-800">₹{Number(s.monthlyAmount).toLocaleString('en-IN')}</td>
                <td className="py-2">
                  <button onClick={() => toggleSlab.mutate({ id: s.id, isActive: !s.isActive })} className={`px-2 py-0.5 rounded text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
              </tr>
            ))}
            {slabs.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-400">No PT slabs configured yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
