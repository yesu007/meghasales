'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';
import { computeResourceCosting, type ResourceLine, type CostMode } from '@/lib/quotationResourceCosting';

interface ExistingLead { id: number; companyName: string; contactPerson: string; email: string | null; mobile: string | null }
interface Vertical { id: number; name: string; headName?: string | null }
interface CurrencyOption { currencyCode: string; currencySymbol: string }
interface ResourceEmployee { id: number; firstName: string; lastName: string; employeeCode: string; designation: string | null; department: string | null; dayRate: number | null }

const employeeLabel = (e: ResourceEmployee) => `${e.firstName} ${e.lastName} — ${e.designation || 'Employee'} (${e.employeeCode})`;

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';
const blankResource = (): ResourceLine => ({ role: '', qty: 1, durationDays: 10, dayRate: 5000 });

function ModeToggle({ mode, onChange, pctLabel, fixedLabel }: { mode: CostMode; onChange: (m: CostMode) => void; pctLabel: string; fixedLabel: string }) {
  return (
    <div className="flex border border-slate-300 rounded-lg overflow-hidden text-xs font-medium">
      <button type="button" onClick={() => onChange('PCT')} className={`flex-1 px-2 py-2 ${mode === 'PCT' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{pctLabel}</button>
      <button type="button" onClick={() => onChange('FIXED')} className={`flex-1 px-2 py-2 ${mode === 'FIXED' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{fixedLabel}</button>
    </div>
  );
}

export default function QuotationCalculatorForm({ quotationId }: { quotationId?: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  const [projectName, setProjectName] = useState('');
  const [verticalId, setVerticalId] = useState('');
  const [projectManagerName, setProjectManagerName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('INR');

  const [resources, setResources] = useState<ResourceLine[]>([blankResource()]);
  const [outsourcingCost, setOutsourcingCost] = useState('0');
  const [travelCost, setTravelCost] = useState('0');
  const [adminMode, setAdminMode] = useState<CostMode>('PCT');
  const [adminValue, setAdminValue] = useState('10');
  const [markupMode, setMarkupMode] = useState<CostMode>('PCT');
  const [markupValue, setMarkupValue] = useState('25');
  const [discountMode, setDiscountMode] = useState<CostMode>('PCT');
  const [discountValue, setDiscountValue] = useState('0');
  const [taxPercentage, setTaxPercentage] = useState('18');
  const [validityDays, setValidityDays] = useState('30');
  const [overrideAmount, setOverrideAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [status, setStatus] = useState('DRAFT');
  const [quotationNumber, setQuotationNumber] = useState('');

  const { data: existing } = useQuery({
    queryKey: ['quotation', quotationId],
    queryFn: async () => { const r = await fetch(`/api/quotations/${quotationId}`); if (!r.ok) throw new Error('Failed to load quotation'); return r.json(); },
    enabled: !!quotationId,
  });
  const { data: existingLeads = [] } = useQuery<ExistingLead[]>({
    queryKey: ['leads-for-quotation'],
    queryFn: async () => { const r = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc'); if (!r.ok) throw new Error('Failed to fetch leads'); const data = await r.json(); return data.content; },
  });
  const { data: verticals = [] } = useQuery<Vertical[]>({
    queryKey: ['verticals'],
    queryFn: async () => { const r = await fetch('/api/verticals'); if (!r.ok) throw new Error('Failed to fetch verticals'); return r.json(); },
  });
  const { data: currencies = [] } = useQuery<CurrencyOption[]>({
    queryKey: ['currencies'],
    queryFn: async () => { const r = await fetch('/api/currencies?activeOnly=true'); if (!r.ok) throw new Error('Failed to fetch currencies'); return r.json(); },
  });
  const currencySymbol = currencies.find((c) => c.currencyCode === currencyCode)?.currencySymbol || currencyCode;
  const { data: resourceEmployees = [] } = useQuery<ResourceEmployee[]>({
    queryKey: ['quotation-resource-employees'],
    queryFn: async () => { const r = await fetch('/api/quotations/resource-employees'); if (!r.ok) throw new Error('Failed to fetch employees'); return r.json(); },
  });
  const employeeByLabel = useMemo(() => new Map(resourceEmployees.map((e) => [employeeLabel(e), e])), [resourceEmployees]);

  useEffect(() => {
    if (!existing) return;
    setProjectName(existing.projectName || '');
    setVerticalId(existing.verticalId ? String(existing.verticalId) : '');
    setCurrencyCode(existing.currencyCode || 'INR');
    setOutsourcingCost(String(Number(existing.outsourcingCost) || 0));
    setTravelCost(String(Number(existing.travelCost) || 0));
    setTaxPercentage(String(Number(existing.taxPercentage) || 0));
    setNotes(existing.notes || '');
    setStatus(existing.status);
    setQuotationNumber(existing.quotationNumber);
    setClientName(existing.lead?.contactPerson || '');
    setCompanyName(existing.lead?.companyName || '');

    const snap = existing.pricingSnapshot || {};
    setResources(Array.isArray(snap.resources) && snap.resources.length > 0 ? snap.resources : [blankResource()]);
    setAdminMode(snap.adminMode === 'FIXED' ? 'FIXED' : 'PCT');
    setAdminValue(String(Number(snap.adminValue) || 0));
    setMarkupMode(snap.markupMode === 'FIXED' ? 'FIXED' : 'PCT');
    setMarkupValue(String(Number(snap.markupValue) || 0));
    setDiscountMode(snap.discountMode === 'FIXED' ? 'FIXED' : 'PCT');
    setDiscountValue(String(Number(snap.discountValue) || 0));
    setProjectManagerName(snap.projectManagerName || '');
    setPackageName(snap.packageName || '');
    setValidityDays(String(Number(snap.validityDays) || 30));
    setOverrideAmount(existing.totalAmountOverridden ? String(Number(existing.totalAmount)) : '');
  }, [existing]);

  const selectVertical = (id: string) => {
    setVerticalId(id);
    const vertical = verticals.find((v) => String(v.id) === id);
    if (vertical?.headName) setProjectManagerName(vertical.headName);
  };

  const selectExistingLead = (id: string) => {
    setSelectedLeadId(id);
    const lead = existingLeads.find((l) => String(l.id) === id);
    setClientName(lead?.contactPerson || '');
    setCompanyName(lead?.companyName || '');
    setClientEmail(lead?.email || '');
    setClientPhone(lead?.mobile || '');
  };

  const updateResource = (idx: number, field: keyof ResourceLine, value: string) => {
    setResources((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      if (field === 'role') return { ...r, role: value };
      return { ...r, [field]: Number(value) || 0 };
    }));
  };

  // Typing/selecting a role that exactly matches an autocomplete suggestion
  // (see the datalist in the Resources table) auto-fills that row's day
  // rate from the employee's derived rate — mirrors the vertical-head and
  // existing-lead auto-fill patterns elsewhere in this form. Free typing
  // that doesn't match any employee just sets the role text, unchanged.
  const updateResourceRole = (idx: number, value: string) => {
    const matched = employeeByLabel.get(value);
    setResources((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      if (matched?.dayRate != null) return { ...r, role: value, dayRate: matched.dayRate };
      return { ...r, role: value };
    }));
  };
  const addResource = () => setResources((prev) => [...prev, blankResource()]);
  const removeResource = (idx: number) => setResources((prev) => prev.filter((_, i) => i !== idx));

  const validResources = useMemo(
    () => resources.filter((r) => r.role.trim() && r.qty > 0 && r.durationDays > 0 && r.dayRate > 0),
    [resources]
  );

  const costing = useMemo(() => computeResourceCosting({
    resources: validResources,
    adminMode,
    adminValue: Number(adminValue) || 0,
    outsourcingCost: Number(outsourcingCost) || 0,
    travelCost: Number(travelCost) || 0,
    markupMode,
    markupValue: Number(markupValue) || 0,
    discountMode,
    discountValue: Number(discountValue) || 0,
    taxPercentage: Number(taxPercentage) || 0,
    overrideAmount: Number(overrideAmount) || 0,
  }), [validResources, adminMode, adminValue, outsourcingCost, travelCost, markupMode, markupValue, discountMode, discountValue, taxPercentage, overrideAmount]);

  const fmt = (n: number) => formatCurrency(n, currencyCode, { symbol: currencySymbol });

  const marginBand = costing.marginPercent >= 30 ? 'healthy' : costing.marginPercent >= 15 ? 'caution' : 'risk';
  const marginColors: Record<string, string> = {
    healthy: 'bg-green-100 text-green-700 border-green-300',
    caution: 'bg-amber-100 text-amber-700 border-amber-300',
    risk: 'bg-red-100 text-red-700 border-red-300',
  };
  const marginLabels: Record<string, string> = { healthy: 'Margin healthy', caution: 'Review margin', risk: 'Margin risk' };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        costingMode: 'RESOURCE_BASED',
        projectName: projectName || null,
        verticalId: verticalId || null,
        currencyCode,
        notes: notes || null,
        resources: validResources,
        adminMode,
        adminValue: Number(adminValue) || 0,
        outsourcingCost: Number(outsourcingCost) || 0,
        travelCost: Number(travelCost) || 0,
        markupMode,
        markupValue: Number(markupValue) || 0,
        discountMode,
        discountValue: Number(discountValue) || 0,
        taxPercentage: Number(taxPercentage) || 0,
        validityDays: Number(validityDays) || 30,
        overrideAmount: Number(overrideAmount) || 0,
        projectManagerName: projectManagerName || null,
        packageName: packageName || null,
      };

      if (quotationId) {
        // Editing goes through the generic PUT (a plain conditional-spread
        // updater), so it's submitted fully computed here — same convention
        // the existing catalog-mode edit flow already uses (it submits
        // pricing computed client-side too). Safe because this uses the
        // exact same computeResourceCosting the server uses on create.
        Object.assign(body, {
          resourceCostTotal: costing.resourceCostTotal,
          adminCost: costing.adminCost,
          markupPercentage: markupMode === 'PCT' ? Number(markupValue) || 0 : null,
          markupAmount: costing.markupAmount,
          discountPercentage: discountMode === 'PCT' ? Number(discountValue) || 0 : null,
          discountAmount: costing.discountAmount,
          marginPercent: costing.marginPercent,
          calculatedTotalAmount: costing.calculatedTotalAmount,
          totalAmount: costing.totalAmount,
          totalAmountOverridden: costing.totalAmountOverridden,
          taxAmount: costing.taxAmount,
          validUntil: dayjs().add(Number(validityDays) || 30, 'day').toISOString(),
          pricingSnapshot: {
            resources: validResources,
            adminMode,
            adminValue: Number(adminValue) || 0,
            markupMode,
            markupValue: Number(markupValue) || 0,
            discountMode,
            discountValue: Number(discountValue) || 0,
            projectManagerName: projectManagerName || null,
            packageName: packageName || null,
            validityDays: Number(validityDays) || 30,
          },
        });
      } else if (clientMode === 'existing') {
        body.leadId = selectedLeadId;
      } else {
        Object.assign(body, { companyName, clientName, clientEmail, clientPhone });
      }

      const url = quotationId ? `/api/quotations/${quotationId}` : '/api/quotations';
      const method = quotationId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to save quotation'); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (quotationId) queryClient.invalidateQueries({ queryKey: ['quotation', quotationId] });
      toast.success(quotationId ? 'Quotation updated' : 'Quotation created');
      if (!quotationId) router.push(`/dashboard/quotations/calculator/${data.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!quotationId) {
      if (clientMode === 'existing' && !selectedLeadId) { toast.error('Select a client'); return; }
      if (clientMode === 'new' && (!clientName || !companyName)) { toast.error('Client name and company are required'); return; }
    }
    if (validResources.length === 0) { toast.error('At least one resource line item is required'); return; }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/quotations" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-1">
            <ArrowLeftIcon className="h-4 w-4" /> Back to Quotations
          </Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
            {quotationId ? `Edit Quotation ${quotationNumber}` : 'New Resource-Based Quotation'}
          </h1>
          <p className="text-slate-500 mt-0.5 text-sm">Resource, admin allocation &amp; markup based commercial estimation</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Opportunity Details */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Opportunity Details</h2>
            {quotationId ? (
              <p className="text-xs text-slate-400 mb-3">Client is tied to the lead and cannot be changed from here.</p>
            ) : (
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setClientMode('existing')} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${clientMode === 'existing' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>Existing Client</button>
                <button type="button" onClick={() => setClientMode('new')} className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${clientMode === 'new' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>New Client</button>
              </div>
            )}
            {!quotationId && clientMode === 'existing' ? (
              <div className="mb-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <select value={selectedLeadId} onChange={(e) => selectExistingLead(e.target.value)} className={inputCls}>
                  <option value="">Select a client</option>
                  {existingLeads.map((l) => <option key={l.id} value={l.id}>{l.companyName} — {l.contactPerson}</option>)}
                </select>
              </div>
            ) : !quotationId ? (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Name *</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Company *</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={inputCls} /></div>
              </div>
            ) : (
              <div className="mb-3 text-sm text-slate-700 font-medium">{companyName} — {clientName}</div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vertical</label>
                <select value={verticalId} onChange={(e) => selectVertical(e.target.value)} className={inputCls}>
                  <option value="">Company-wide</option>
                  {verticals.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Project Manager</label>
                <input value={projectManagerName} onChange={(e) => setProjectManagerName(e.target.value)} placeholder="Auto-filled from the vertical's head" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Package Name</label>
                <input value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="e.g. Implementation — Standard" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
                <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} className={inputCls}>
                  <option value="INR">INR</option>
                  {currencies.filter((c) => c.currencyCode !== 'INR').map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Resources */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Resources</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 uppercase tracking-wide">
                    <th className="text-left pb-2 pr-2 min-w-[200px]">Role</th>
                    <th className="text-left pb-2 px-2 w-16">Qty</th>
                    <th className="text-left pb-2 px-2 w-24">Duration (days)</th>
                    <th className="text-left pb-2 px-2 w-28">Unit Cost / day</th>
                    <th className="text-right pb-2 px-2 w-28">Total Cost</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resources.map((r, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 pr-2 min-w-[200px]">
                        <input
                          value={r.role}
                          onChange={(e) => updateResourceRole(idx, e.target.value)}
                          list="resource-employee-options"
                          placeholder="Type a role, or pick an employee"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-1.5 px-2"><input type="number" min="0" value={r.qty || ''} onChange={(e) => updateResource(idx, 'qty', e.target.value)} className={inputCls} /></td>
                      <td className="py-1.5 px-2"><input type="number" min="0" value={r.durationDays || ''} onChange={(e) => updateResource(idx, 'durationDays', e.target.value)} className={inputCls} /></td>
                      <td className="py-1.5 px-2"><input type="number" min="0" value={r.dayRate || ''} onChange={(e) => updateResource(idx, 'dayRate', e.target.value)} className={inputCls} /></td>
                      <td className="py-1.5 px-2 text-right font-medium text-slate-700 whitespace-nowrap">{fmt(r.qty * r.durationDays * r.dayRate)}</td>
                      <td className="py-1.5 text-center">
                        <button type="button" onClick={() => removeResource(idx)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove resource">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addResource} className="mt-3 flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm font-medium text-amber-700 hover:bg-amber-50">
              <PlusIcon className="h-4 w-4" /> Add resource
            </button>
            <p className="text-xs text-slate-400 mt-2">Picking an employee from the role suggestions fills in a day rate estimated from their CTC — still editable afterward.</p>
            <datalist id="resource-employee-options">
              {resourceEmployees.map((e) => <option key={e.id} value={employeeLabel(e)} />)}
            </datalist>
          </div>

          {/* Other Project Costs */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Other Project Costs</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Outsourcing</label><input type="number" min="0" value={outsourcingCost} onChange={(e) => setOutsourcingCost(e.target.value)} className={inputCls} /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Travel / Other</label><input type="number" min="0" value={travelCost} onChange={(e) => setTravelCost(e.target.value)} className={inputCls} /></div>
            </div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Admin / Overhead</label>
            <div className="grid grid-cols-2 gap-3">
              <ModeToggle mode={adminMode} onChange={setAdminMode} pctLabel="% of resource cost" fixedLabel="Fixed amount" />
              <input type="number" min="0" value={adminValue} onChange={(e) => setAdminValue(e.target.value)} className={inputCls} />
            </div>
            <p className="text-xs text-slate-400 mt-2">Admin allocation as a fixed amount or a % of resource cost.</p>
          </div>

          {/* Commercial Terms */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Commercial Terms</h2>
            <label className="block text-sm font-medium text-slate-700 mb-1">Markup</label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <ModeToggle mode={markupMode} onChange={setMarkupMode} pctLabel="% of base cost" fixedLabel="Fixed amount" />
              <input type="number" min="0" value={markupValue} onChange={(e) => setMarkupValue(e.target.value)} className={inputCls} />
            </div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Discount</label>
            <div className="grid grid-cols-2 gap-3 mb-1">
              <ModeToggle mode={discountMode} onChange={setDiscountMode} pctLabel="% of subtotal" fixedLabel="Fixed amount" />
              <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputCls} />
            </div>
            <p className="text-xs text-slate-400 mb-3">Applied to the subtotal (cost + markup) before tax.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Tax % (where applicable)</label><input type="number" min="0" value={taxPercentage} onChange={(e) => setTaxPercentage(e.target.value)} className={inputCls} /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Quotation Validity (days)</label><input type="number" min="1" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} className={inputCls} /></div>
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Right: live quotation summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quotation No.</p>
                <p className="text-sm font-semibold text-slate-700">{quotationNumber || 'Draft — auto-assigned on save'}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${marginColors[marginBand]}`}>
                {marginLabels[marginBand]}
              </span>
            </div>
            {projectName && (
              <div className="mb-3">
                <p className="text-base font-semibold text-slate-800">{projectName}</p>
                <p className="text-xs text-slate-500">{[verticals.find((v) => String(v.id) === verticalId)?.name, projectManagerName, companyName].filter(Boolean).join(' · ')}</p>
              </div>
            )}
            <hr className="border-dashed border-slate-200 mb-2" />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100"><span className="text-slate-500">Resource cost</span><span className="font-mono font-medium text-slate-700">{fmt(costing.resourceCostTotal)}</span></div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100"><span className="text-slate-500">Outsourcing</span><span className="font-mono font-medium text-slate-700">{fmt(Number(outsourcingCost) || 0)}</span></div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100"><span className="text-slate-500">Travel / other</span><span className="font-mono font-medium text-slate-700">{fmt(Number(travelCost) || 0)}</span></div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100"><span className="text-slate-500">Admin / overhead</span><span className="font-mono font-medium text-slate-700">{fmt(costing.adminCost)}{adminMode === 'PCT' && ` (${adminValue}%)`}</span></div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100 font-semibold"><span className="text-slate-800">Base project cost</span><span className="font-mono text-slate-800">{fmt(costing.baseCost)}</span></div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100"><span className="text-slate-500">Markup</span><span className="font-mono font-medium text-slate-700">{fmt(costing.markupAmount)}{markupMode === 'PCT' && ` (${markupValue}%)`}</span></div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100"><span className="text-slate-500">Discount</span><span className={`font-mono font-medium ${costing.discountAmount > 0 ? 'text-red-600' : 'text-slate-700'}`}>{costing.discountAmount > 0 ? '-' : ''}{fmt(costing.discountAmount)}{discountMode === 'PCT' && ` (${discountValue}%)`}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">Tax</span><span className="font-mono font-medium text-slate-700">{fmt(costing.taxAmount)} ({taxPercentage}%)</span></div>
            </div>

            <div className="text-center my-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quoted Amount</p>
              <p className="text-3xl font-bold text-slate-800 mt-0.5">{fmt(costing.totalAmount)}</p>
              {costing.totalAmountOverridden && <p className="text-xs text-amber-600 mt-1">Overridden — system value was {fmt(costing.calculatedTotalAmount)}</p>}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="text-xs font-medium text-slate-600">Discount</label>
                <div className="flex items-center gap-1.5">
                  <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as CostMode)} className="px-1.5 py-1.5 border border-slate-300 rounded text-xs text-slate-700">
                    <option value="PCT">%</option>
                    <option value="FIXED">₹</option>
                  </select>
                  <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="w-24 px-2 py-1.5 border border-slate-300 rounded text-sm text-right text-slate-800" />
                </div>
              </div>
              <p className="text-xs text-slate-400">{costing.discountAmount > 0 ? `${fmt(costing.discountAmount)} off, applied before tax` : 'Applied to the subtotal (cost + markup) before tax.'}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-600">Final amount (override)</label>
                <input type="number" min="0" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} placeholder={fmt(costing.calculatedTotalAmount)} className="w-32 px-2 py-1.5 border border-slate-300 rounded text-sm text-right text-slate-800" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Leave blank to publish the system-calculated amount.</p>
            </div>

            <button onClick={handleSave} disabled={saveMutation.isPending} className="w-full px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving...' : quotationId ? 'Save Changes' : 'Save Quotation'}
            </button>

            <p className="text-xs text-slate-400 mt-3">
              Valid for <span className="font-medium text-slate-600">{validityDays}</span> days from issue.
              {quotationId && <> Status: <span className="font-medium text-slate-600">{status}</span> — change status or download a PDF from the <Link href="/dashboard/quotations" className="text-amber-700 hover:underline">Quotations list</Link>.</>}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
