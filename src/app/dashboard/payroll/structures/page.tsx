'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon, PencilIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface SalaryComponent {
  id: number;
  name: string;
  code: string;
  type: 'EARNING' | 'DEDUCTION';
  calculationType: 'FLAT' | 'PERCENT_OF_BASIC';
  isStatutory: boolean;
  statutoryType: 'PF' | 'ESI' | 'PT' | null;
  isActive: boolean;
}

interface StructureComponentRow {
  id: number;
  value: string;
  component: SalaryComponent;
}

interface SalaryStructure {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  components: StructureComponentRow[];
  _count?: { assignments: number };
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchComponents(): Promise<SalaryComponent[]> {
  const res = await fetch('/api/payroll/components');
  if (!res.ok) throw new Error('Failed to fetch components');
  return res.json();
}

async function fetchStructures(): Promise<SalaryStructure[]> {
  const res = await fetch('/api/payroll/structures');
  if (!res.ok) throw new Error('Failed to fetch structures');
  return res.json();
}

export default function SalaryStructuresPage() {
  const queryClient = useQueryClient();
  const { data: components = [] } = useQuery({ queryKey: ['payroll-components'], queryFn: fetchComponents });
  const { data: structures = [] } = useQuery({ queryKey: ['payroll-structures'], queryFn: fetchStructures });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-components'] });
    queryClient.invalidateQueries({ queryKey: ['payroll-structures'] });
  };

  // ---- Components ----
  const [showComponentForm, setShowComponentForm] = useState(false);
  const blankComponentForm = { name: '', code: '', type: 'EARNING', calculationType: 'FLAT', statutoryType: '' };
  const [componentForm, setComponentForm] = useState(blankComponentForm);

  const createComponent = useMutation({
    mutationFn: async (data: typeof componentForm) => {
      const res = await fetch('/api/payroll/components', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, statutoryType: data.statutoryType || null }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create component'); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast.success('Component created'); setShowComponentForm(false); setComponentForm(blankComponentForm); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleComponentActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/payroll/components/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error('Failed to update component');
      return res.json();
    },
    onSuccess: invalidateAll,
    onError: () => toast.error('Failed to update component'),
  });

  // ---- Structures ----
  const [showStructureForm, setShowStructureForm] = useState(false);
  const [structureName, setStructureName] = useState('');
  const [structureDesc, setStructureDesc] = useState('');
  const [structureRows, setStructureRows] = useState<Array<{ componentId: string; value: string }>>([{ componentId: '', value: '' }]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingStructureId, setEditingStructureId] = useState<number | null>(null);

  const resetStructureForm = () => {
    setStructureName(''); setStructureDesc(''); setStructureRows([{ componentId: '', value: '' }]);
    setShowStructureForm(false); setEditingStructureId(null);
  };
  const openEditStructure = (s: SalaryStructure) => {
    setEditingStructureId(s.id);
    setStructureName(s.name);
    setStructureDesc(s.description || '');
    setStructureRows(s.components.length > 0 ? s.components.map((c) => ({ componentId: String(c.component.id), value: c.value })) : [{ componentId: '', value: '' }]);
    setShowStructureForm(true);
  };

  const saveStructure = useMutation({
    mutationFn: async () => {
      const rows = structureRows.filter((r) => r.componentId && r.value !== '');
      const body = { name: structureName, description: structureDesc || null, components: rows.map((r) => ({ componentId: Number(r.componentId), value: Number(r.value) })) };
      const res = await fetch(editingStructureId ? `/api/payroll/structures/${editingStructureId}` : '/api/payroll/structures', {
        method: editingStructureId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save structure'); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast.success(editingStructureId ? 'Salary structure updated' : 'Salary structure created'); resetStructureForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleStructureActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/payroll/structures/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error('Failed to update structure');
      return res.json();
    },
    onSuccess: invalidateAll,
    onError: () => toast.error('Failed to update structure'),
  });

  const activeComponents = components.filter((c) => c.isActive);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Salary Structures</h1>
        <p className="text-slate-500 mt-0.5 text-sm sm:text-base">Define pay components and bundle them into reusable CTC templates</p>
      </div>

      {/* Components */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Salary Components</h2>
          <button onClick={() => setShowComponentForm((v) => !v)} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <PlusIcon className="h-4 w-4" /> Add Component
          </button>
        </div>

        {showComponentForm && (
          <form
            onSubmit={(e) => { e.preventDefault(); if (!componentForm.name || !componentForm.code) { toast.error('Name and code are required'); return; } createComponent.mutate(componentForm); }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200"
          >
            <input placeholder="Name (e.g. Basic)" value={componentForm.name} onChange={(e) => setComponentForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
            <input placeholder="Code (e.g. BASIC)" value={componentForm.code} onChange={(e) => setComponentForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className={inputCls} />
            <select value={componentForm.type} onChange={(e) => setComponentForm((f) => ({ ...f, type: e.target.value }))} className={inputCls}>
              <option value="EARNING">Earning</option>
              <option value="DEDUCTION">Deduction</option>
            </select>
            <select value={componentForm.calculationType} onChange={(e) => setComponentForm((f) => ({ ...f, calculationType: e.target.value }))} className={inputCls}>
              <option value="FLAT">Flat amount</option>
              <option value="PERCENT_OF_BASIC">% of Basic</option>
            </select>
            <select value={componentForm.statutoryType} onChange={(e) => setComponentForm((f) => ({ ...f, statutoryType: e.target.value }))} className={inputCls} title="Applies the matching statutory rule from Statutory Settings when this component is resolved">
              <option value="">Not statutory</option>
              <option value="PF">PF — capped at wage ceiling</option>
              <option value="ESI">ESI — gated by gross threshold</option>
              <option value="PT">PT — resolved by slab, ignores this row&apos;s value</option>
            </select>
            <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowComponentForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={createComponent.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">Add</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500 uppercase">
              <tr><th className="py-1.5 pr-4">Name</th><th className="py-1.5 pr-4">Code</th><th className="py-1.5 pr-4">Type</th><th className="py-1.5 pr-4">Calculation</th><th className="py-1.5">Active</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {components.map((c) => (
                <tr key={c.id}>
                  <td className="py-2 pr-4 text-slate-800">{c.name}{c.statutoryType && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-slate-100 text-slate-500">{c.statutoryType}</span>}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-500">{c.code}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded text-xs font-medium ${c.type === 'EARNING' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{c.type}</span></td>
                  <td className="py-2 pr-4 text-slate-500">{c.calculationType === 'FLAT' ? 'Flat' : '% of Basic'}</td>
                  <td className="py-2">
                    <button onClick={() => toggleComponentActive.mutate({ id: c.id, isActive: !c.isActive })} className={`px-2 py-0.5 rounded text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
              {components.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-slate-400">No components yet — add Basic, HRA, etc. to get started.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Structures */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Salary Structure Templates</h2>
          <button onClick={() => (showStructureForm ? resetStructureForm() : setShowStructureForm(true))} className="flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:text-amber-800">
            <PlusIcon className="h-4 w-4" /> New Structure
          </button>
        </div>

        {showStructureForm && (
          <form onSubmit={(e) => { e.preventDefault(); if (!structureName) { toast.error('Name is required'); return; } saveStructure.mutate(); }} className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Structure name (e.g. Standard L1)" value={structureName} onChange={(e) => setStructureName(e.target.value)} className={inputCls} />
              <input placeholder="Description (optional)" value={structureDesc} onChange={(e) => setStructureDesc(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-2">
              {structureRows.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <select value={row.componentId} onChange={(e) => setStructureRows((rows) => rows.map((r, j) => j === i ? { ...r, componentId: e.target.value } : r))} className={inputCls}>
                    <option value="">Select component</option>
                    {activeComponents.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.calculationType === 'FLAT' ? '₹' : '%'})</option>)}
                  </select>
                  <input type="number" min="0" step="0.01" placeholder="Value" value={row.value} onChange={(e) => setStructureRows((rows) => rows.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} className={`${inputCls} max-w-[140px]`} />
                  <button type="button" onClick={() => setStructureRows((rows) => rows.filter((_, j) => j !== i))} className="p-2 text-slate-400 hover:text-red-600"><XMarkIcon className="h-4 w-4" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setStructureRows((rows) => [...rows, { componentId: '', value: '' }])} className="text-sm text-amber-700 hover:text-amber-800 font-medium">+ Add component</button>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={resetStructureForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button type="submit" disabled={saveStructure.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveStructure.isPending ? 'Saving...' : editingStructureId ? 'Save Changes' : 'Create Structure'}
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-100">
          {structures.map((s) => (
            <div key={s.id} className="py-3">
              <button onClick={() => setExpandedId((e) => (e === s.id ? null : s.id))} className="w-full flex items-center justify-between text-left">
                <div>
                  <p className="font-medium text-slate-800">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.components.length} component{s.components.length === 1 ? '' : 's'} · {s._count?.assignments ?? 0} employee{(s._count?.assignments ?? 0) === 1 ? '' : 's'} assigned</p>
                </div>
                <div className="flex items-center gap-3">
                  <span onClick={(e) => { e.stopPropagation(); toggleStructureActive.mutate({ id: s.id, isActive: !s.isActive }); }} className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); openEditStructure(s); }} className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  {expandedId === s.id ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
                </div>
              </button>
              {expandedId === s.id && (
                <div className="mt-3 pl-1">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-50">
                      {s.components.map((sc) => (
                        <tr key={sc.id}>
                          <td className="py-1.5 pr-4 text-slate-600">{sc.component.name}</td>
                          <td className="py-1.5 pr-4 text-right text-slate-800">{sc.component.calculationType === 'FLAT' ? `₹${Number(sc.value).toLocaleString('en-IN')}` : `${Number(sc.value)}%`}</td>
                        </tr>
                      ))}
                      {s.components.length === 0 && <tr><td className="py-1.5 text-slate-400">No components in this structure.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {structures.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No structures yet — create one from your components above.</p>}
        </div>
      </div>
    </div>
  );
}
