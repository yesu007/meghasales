'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, TrashIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { formatCurrency } from '@/lib/currency';
import { computeResourceCosting, type ResourceLine, type CostMode } from '@/lib/quotationResourceCosting';
import { validateMilestonePlan, type MilestonePlanInput } from '@/lib/quotationMilestones';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectsForLead } from '@/hooks/useProjectsForLead';

interface ExistingLead { id: number; companyName: string; projectName: string | null; contactPerson: string; email: string | null; mobile: string | null }
interface Vertical { id: number; name: string; headName?: string | null }
interface CurrencyOption { currencyCode: string; currencySymbol: string }
interface ResourceEmployee { id: number; firstName: string; lastName: string; employeeCode: string; designation: string | null; department: string | null; dayRate: number | null }
interface CompanyOption { id: number; name: string }
interface LegalEntityOption { id: number; legalName: string; taxRegistrationNumber: string | null; isActive: boolean; country: { countryName: string; flagEmoji: string | null } }
interface CompanyDetailForQuotation { id: number; legalEntities: LegalEntityOption[] }
interface CompanyProfileTerms { termsAndConditions: string | null; paymentTerms: string | null; warrantyTerms: string | null; defaultAdminOverheadMode: string | null; defaultAdminOverheadValue: number | string | null }

const employeeLabel = (e: ResourceEmployee) => `${e.firstName} ${e.lastName} — ${e.designation || 'Employee'} (${e.employeeCode})`;
// The Designation column's content once an employee is picked — just who
// they are (name + code), since their job title already lives in Role.
const employeeRefLabel = (e: ResourceEmployee) => `${e.firstName} ${e.lastName} (${e.employeeCode})`;

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
  const searchParams = useSearchParams();
  // Deep-link from the Projects page's "New Quotation" action
  // (/dashboard/quotations/calculator?projectId=..&leadId=..) — leadId is
  // whichever of Project.customerId/leadId is set (see that model's own
  // comment: a Project is tied to exactly one). Only consulted for a
  // brand-new quotation; editing an existing one always keeps its own lead.
  const prefillProjectId = searchParams.get('projectId');
  const prefillLeadId = searchParams.get('leadId');
  const queryClient = useQueryClient();
  const { has } = usePermissions();
  const canAuthorizeOverride = has('authorize_quotation_override');

  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // Which project (Project master) this quotation is for — the dropdown is
  // scoped to selectedLeadId (create) or the loaded quotation's leadId
  // (edit) via useProjectsForLead below. `projectName` is kept in sync from
  // whichever project is picked (see the sync effect below) so the legacy
  // text column still gets written on save. Kept separate from
  // newClientProjectName so Existing Client <-> New Client never copies one
  // into the other (New Client has no lead yet, so it keeps its own
  // free-text field instead of a dropdown).
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [newClientProjectName, setNewClientProjectName] = useState('');
  const [verticalId, setVerticalId] = useState('');
  const [projectManagerName, setProjectManagerName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [currencyCode, setCurrencyCode] = useState('INR');

  // Which of the customer Company's per-country legal entities this
  // quotation bills to — billingCompanyId is UI-only (picks which
  // company's entities to list); only legalEntityId is persisted.
  const [billingCompanyId, setBillingCompanyId] = useState('');
  const [legalEntityId, setLegalEntityId] = useState('');

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
  const [additionalTerms, setAdditionalTerms] = useState('');

  // Payment Milestones plan — optional (empty = the existing one lump-sum
  // invoice on approval, unchanged). Only percentage + gapDays are edited
  // here; milestone 1's gapDays is meaningless (it's always invoiced
  // immediately on approval) so its input is disabled rather than shown as
  // a live field. Turned into dated, invoiced QuotationPaymentMilestone rows
  // server-side once the quotation is approved — see
  // materializeQuotationMilestones.
  const [milestones, setMilestones] = useState<{ percentage: string; gapDays: string }[]>([]);

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
  const { data: companyProfile } = useQuery<CompanyProfileTerms | null>({
    queryKey: ['company-profile-terms'],
    queryFn: async () => { const r = await fetch('/api/quotation-config?type=company-profile'); if (!r.ok) throw new Error('Failed to fetch company profile'); return r.json(); },
  });
  const currencySymbol = currencies.find((c) => c.currencyCode === currencyCode)?.currencySymbol || currencyCode;
  const { data: resourceEmployees = [] } = useQuery<ResourceEmployee[]>({
    queryKey: ['quotation-resource-employees'],
    queryFn: async () => { const r = await fetch('/api/quotations/resource-employees'); if (!r.ok) throw new Error('Failed to fetch employees'); return r.json(); },
  });
  const employeeByLabel = useMemo(() => new Map(resourceEmployees.map((e) => [employeeLabel(e), e])), [resourceEmployees]);

  const { data: companies = [] } = useQuery<CompanyOption[]>({
    queryKey: ['companies-for-quotation'],
    queryFn: async () => { const r = await fetch('/api/companies'); if (!r.ok) throw new Error('Failed to fetch companies'); return r.json(); },
  });
  const { data: billingCompanyDetail } = useQuery<CompanyDetailForQuotation>({
    queryKey: ['company-detail-for-quotation', billingCompanyId],
    queryFn: async () => { const r = await fetch(`/api/companies/${billingCompanyId}`); if (!r.ok) throw new Error('Failed to fetch company'); return r.json(); },
    enabled: !!billingCompanyId,
  });
  const legalEntityOptions = (billingCompanyDetail?.legalEntities || []).filter((e) => e.isActive);

  // Project dropdown, scoped to whichever Lead/Customer is active — create
  // uses selectedLeadId, editing uses the loaded quotation's own leadId. See
  // useProjectsForLead's own comment for the relation this filters on.
  const activeLeadIdForProjects = quotationId ? (existing?.leadId ? String(existing.leadId) : '') : (clientMode === 'existing' ? selectedLeadId : '');
  const { data: leadProjects = [], isLoading: projectsLoading } = useProjectsForLead(activeLeadIdForProjects);
  useEffect(() => {
    if (!activeLeadIdForProjects) return;
    if (leadProjects.length === 1 && String(leadProjects[0].id) !== projectId) {
      setProjectId(String(leadProjects[0].id));
    }
  }, [activeLeadIdForProjects, leadProjects]);
  // Keeps the legacy free-text projectName column (still used for
  // display/PDF/search) in sync with whichever project is selected.
  useEffect(() => {
    const p = leadProjects.find((x) => String(x.id) === projectId);
    if (p) setProjectName(p.projectName);
  }, [projectId, leadProjects]);
  // Auto-fill Vertical (and Project Manager) from whichever Project is
  // selected — Project Master already ties every project to one Vertical
  // (and that vertical's Head, via Project.headId — see that model's own
  // comment), so there's no reason to make the user re-pick it here on a
  // brand-new quotation. Keyed only on [projectId, leadProjects], not
  // verticalId, so a later manual change to Vertical is never fought back.
  // Skipped when editing (quotationId set) — the effect above already
  // restores that quotation's own saved verticalId, which must win even if
  // the linked project's vertical has since changed.
  useEffect(() => {
    if (quotationId) return;
    const p = leadProjects.find((x) => String(x.id) === projectId);
    if (!p) return;
    setVerticalId(String(p.verticalId));
    if (p.headName) setProjectManagerName(p.headName);
  }, [quotationId, projectId, leadProjects]);

  // Deep-link prefill (create only): pick the client the linked Project
  // belongs to as soon as the leads list has loaded. Guarded on
  // `!selectedLeadId` so it only ever fires once, on landing — it must not
  // fight a client the user deliberately changes afterward.
  useEffect(() => {
    if (quotationId || !prefillLeadId || selectedLeadId || existingLeads.length === 0) return;
    if (existingLeads.some((l) => String(l.id) === prefillLeadId)) {
      setClientMode('existing');
      selectExistingLead(prefillLeadId);
    }
  }, [quotationId, prefillLeadId, selectedLeadId, existingLeads]);
  // Once that client's Project dropdown has loaded, select the specific
  // linked Project (the generic "auto-select if there's exactly one" effect
  // above already covers the single-project case; this handles multi-project
  // clients by matching the id explicitly).
  useEffect(() => {
    if (quotationId || !prefillProjectId || !prefillLeadId) return;
    if (leadProjects.some((p) => String(p.id) === prefillProjectId)) {
      setProjectId(prefillProjectId);
    }
  }, [quotationId, prefillProjectId, prefillLeadId, leadProjects]);

  useEffect(() => {
    if (!existing) return;
    setProjectName(existing.projectName || '');
    setProjectId(existing.projectId ? String(existing.projectId) : '');
    setVerticalId(existing.verticalId ? String(existing.verticalId) : '');
    setCurrencyCode(existing.currencyCode || 'INR');
    setOutsourcingCost(String(Number(existing.outsourcingCost) || 0));
    setTravelCost(String(Number(existing.travelCost) || 0));
    setTaxPercentage(String(Number(existing.taxPercentage) || 0));
    setNotes(existing.notes || '');
    setAdditionalTerms(existing.additionalTerms || '');
    setStatus(existing.status);
    setQuotationNumber(existing.quotationNumber);
    setClientName(existing.lead?.contactPerson || '');
    setCompanyName(existing.lead?.companyName || '');
    setLegalEntityId(existing.legalEntityId ? String(existing.legalEntityId) : '');
    setBillingCompanyId(existing.legalEntity?.companyId ? String(existing.legalEntity.companyId) : '');

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
    setMilestones(
      Array.isArray(snap.paymentMilestones)
        ? snap.paymentMilestones.map((m: any) => ({ percentage: String(m.percentage ?? ''), gapDays: String(m.gapDays ?? '') }))
        : []
    );
    setOverrideAmount(existing.totalAmountOverridden ? String(Number(existing.totalAmount)) : '');
  }, [existing]);

  // Pre-fill Admin/Overhead from the company-wide default — only for a
  // brand-new quotation. An existing one already had its own value restored
  // by the effect above, which must win regardless of fetch timing.
  useEffect(() => {
    if (!companyProfile || quotationId) return;
    setAdminMode(companyProfile.defaultAdminOverheadMode === 'FIXED' ? 'FIXED' : 'PCT');
    setAdminValue(String(Number(companyProfile.defaultAdminOverheadValue) || 0));
  }, [companyProfile, quotationId]);

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
    // Reset the Project selection — the previous pick belonged to whichever
    // lead was selected before, and must not carry over. The Project
    // dropdown (scoped to this new leadId) auto-selects/repopulates via the
    // effects above.
    setProjectId(''); setProjectName('');
  };

  const selectBillingCompany = (id: string) => { setBillingCompanyId(id); setLegalEntityId(''); };

  const updateResource = (idx: number, field: keyof ResourceLine, value: string) => {
    setResources((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      if (field === 'role') return { ...r, role: value };
      return { ...r, [field]: Number(value) || 0 };
    }));
  };

  // Typing/selecting a value that exactly matches an autocomplete suggestion
  // (see the datalist in the Resources table) auto-fills that row's day
  // rate from the employee's derived rate — mirrors the vertical-head and
  // existing-lead auto-fill patterns elsewhere in this form. The datalist
  // option itself has to read "Name — Designation (EMP-code)" (that's the
  // only way to pick one employee out of several sharing a designation),
  // but once picked, Role and Designation split into their own columns:
  // Role becomes the job title (what actually prints on the quotation/
  // invoice line item — see lineItemsFromQuotation), Designation becomes
  // "Name (EMP-code)" for internal reference only. Free typing that doesn't
  // match any suggestion (a contractor, a new hire not yet in the system,
  // or just a plain role title) just sets the role text as typed, leaving
  // Designation whatever it already was — this was already fully supported
  // for costing (see validResources below and buildResourceBasedCosting
  // server-side, neither requires an employee match), it just wasn't
  // obvious from this field's behavior.
  const updateResourceRole = (idx: number, value: string) => {
    const matched = employeeByLabel.get(value);
    setResources((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      if (matched) {
        return {
          ...r,
          role: matched.designation || `${matched.firstName} ${matched.lastName}`,
          employeeRef: employeeRefLabel(matched),
          dayRate: matched.dayRate ?? r.dayRate,
        };
      }
      return { ...r, role: value };
    }));
  };
  // Designation is otherwise a plain, independently editable field — e.g.
  // to correct it, or clear it if a row that used to be staffed by a
  // specific employee no longer is.
  const updateResourceEmployeeRef = (idx: number, value: string) =>
    setResources((prev) => prev.map((r, i) => (i === idx ? { ...r, employeeRef: value } : r)));
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

  const addMilestone = () => setMilestones((prev) => [...prev, { percentage: '', gapDays: prev.length === 0 ? '0' : '15' }]);
  const removeMilestone = (idx: number) => setMilestones((prev) => prev.filter((_, i) => i !== idx));
  const updateMilestone = (idx: number, field: 'percentage' | 'gapDays', value: string) =>
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));

  const milestonePlan: MilestonePlanInput[] = useMemo(
    () => milestones.map((m, idx) => ({ percentage: Number(m.percentage) || 0, gapDays: idx === 0 ? 0 : Number(m.gapDays) || 0 })),
    [milestones]
  );
  const milestonesTotalPct = useMemo(() => Math.round(milestonePlan.reduce((sum, m) => sum + m.percentage, 0) * 100) / 100, [milestonePlan]);
  const milestoneError = useMemo(() => validateMilestonePlan(milestonePlan), [milestonePlan]);

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
      // Existing-client mode (and editing) use `projectName`; a brand-new
      // client being created here uses its own, separate state — never mix
      // the two up when saving.
      const effectiveProjectName = (!quotationId && clientMode === 'new') ? newClientProjectName : projectName;
      // New-client mode has no lead yet to scope a Project dropdown to, so
      // it never sets projectId — only the free-text projectName above.
      const effectiveProjectId = (!quotationId && clientMode === 'new') ? null : (projectId ? parseInt(projectId) : null);
      const body: Record<string, unknown> = {
        costingMode: 'RESOURCE_BASED',
        projectName: effectiveProjectName || null,
        projectId: effectiveProjectId,
        verticalId: verticalId || null,
        legalEntityId: legalEntityId || null,
        currencyCode,
        notes: notes || null,
        additionalTerms: additionalTerms || null,
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
        paymentMilestones: milestonePlan,
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
            paymentMilestones: milestonePlan,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (quotationId) queryClient.invalidateQueries({ queryKey: ['quotation', quotationId] });
      toast.success(quotationId ? 'Quotation updated' : 'Quotation created');
      if (!quotationId) {
        // Where to land after creating a brand-new Budget Estimation depends
        // on where the calculator was opened from: the Projects page's "+
        // New Estimation" link (carries ?projectId=) sends the user back to
        // that project's expanded panel; Quotations' own "New (Resource
        // Calculator)" link (no projectId) sends them to the Quotations list
        // instead of into edit-mode on the row they just created.
        if (prefillProjectId) router.push(`/dashboard/projects?expand=${prefillProjectId}`);
        else router.push('/dashboard/quotations');
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rescheduleMutation = useMutation({
    mutationFn: async ({ milestoneId, newScheduledDate, reason }: { milestoneId: number; newScheduledDate: string; reason?: string }) => {
      const res = await fetch(`/api/quotations/${quotationId}/milestones/${milestoneId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newScheduledDate, reason }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to reschedule milestone'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quotation', quotationId] }); toast.success('Milestone rescheduled'); },
    onError: (err: Error) => toast.error(err.message),
  });

  // A milestone whose invoice has already been partially paid needs a reason
  // on record (enforced again server-side — see the reschedule route) since
  // money has already moved against the date being changed; one that's
  // unpaid or not yet invoiced needs no such friction.
  const handleRescheduleMilestone = (milestone: any, newDateStr: string) => {
    let reason: string | undefined;
    if (milestone.invoice?.status === 'PARTIALLY_PAID') {
      const entered = window.prompt('This milestone has already been partially paid — enter a reason for rescheduling it:');
      if (!entered || !entered.trim()) { toast.error('A reason is required to reschedule a partially paid milestone'); return; }
      reason = entered.trim();
    }
    rescheduleMutation.mutate({ milestoneId: milestone.id, newScheduledDate: newDateStr, reason });
  };

  const handleSave = () => {
    if (!quotationId) {
      if (clientMode === 'existing' && !selectedLeadId) { toast.error('Select a client'); return; }
      if (clientMode === 'new' && (!clientName || !companyName)) { toast.error('Client name and company are required'); return; }
    }
    if (validResources.length === 0) { toast.error('At least one resource line item is required'); return; }
    if (milestoneError) { toast.error(milestoneError); return; }
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
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                  <select value={selectedLeadId} onChange={(e) => selectExistingLead(e.target.value)} className={inputCls}>
                    <option value="">Select a client</option>
                    {existingLeads.map((l) => <option key={l.id} value={l.id}>{l.companyName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    disabled={!selectedLeadId || projectsLoading || leadProjects.length === 0}
                    className={inputCls}
                  >
                    <option value="">
                      {!selectedLeadId ? 'Select a client first' : projectsLoading ? 'Loading projects...' : leadProjects.length === 0 ? 'No projects available' : 'Select project'}
                    </option>
                    {leadProjects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                  </select>
                </div>
              </div>
            ) : !quotationId ? (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Name *</label><input value={clientName} onChange={(e) => setClientName(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Company *</label><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className={inputCls} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label><input value={newClientProjectName} onChange={(e) => setNewClientProjectName(e.target.value)} className={inputCls} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="flex items-end pb-2 text-sm text-slate-700 font-medium">{companyName} — {clientName}</div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    disabled={projectsLoading || leadProjects.length === 0}
                    className={inputCls}
                  >
                    <option value="">{projectsLoading ? 'Loading projects...' : leadProjects.length === 0 ? 'No projects available' : 'Select project'}</option>
                    {leadProjects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bill To (Company)</label>
                <select value={billingCompanyId} onChange={(e) => selectBillingCompany(e.target.value)} className={inputCls}>
                  <option value="">Not linked to a Company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Legal Entity</label>
                <select value={legalEntityId} onChange={(e) => setLegalEntityId(e.target.value)} disabled={!billingCompanyId} className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}>
                  <option value="">{billingCompanyId ? 'Select entity' : 'Pick a Company first'}</option>
                  {legalEntityOptions.map((e) => <option key={e.id} value={e.id}>{e.country.flagEmoji ? `${e.country.flagEmoji} ` : ''}{e.country.countryName} — {e.legalName}</option>)}
                </select>
                {billingCompanyId && legalEntityOptions.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">This company has no legal entities yet — add one from the Company tab on a linked customer&apos;s detail page.</p>
                )}
                {legalEntityId && (() => {
                  const picked = legalEntityOptions.find((e) => String(e.id) === legalEntityId);
                  return picked?.taxRegistrationNumber ? <p className="text-xs text-slate-400 mt-1">Tax Reg: {picked.taxRegistrationNumber}</p> : null;
                })()}
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
                    <th className="text-left pb-2 pr-2 min-w-[180px]">Role</th>
                    <th className="text-left pb-2 px-2 min-w-[180px]">Designation</th>
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
                      <td className="py-1.5 pr-2 min-w-[180px]">
                        <input
                          value={r.role}
                          onChange={(e) => updateResourceRole(idx, e.target.value)}
                          list="resource-employee-options"
                          placeholder="Type a role, or pick an employee"
                          className={inputCls}
                        />
                      </td>
                      <td className="py-1.5 px-2 min-w-[180px]">
                        <input
                          value={r.employeeRef || ''}
                          onChange={(e) => updateResourceEmployeeRef(idx, e.target.value)}
                          placeholder="—"
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
            <p className="text-xs text-slate-400 mt-2">Picking an employee from the suggestions fills in a day rate estimated from their CTC (still editable afterward), sets Role to their job title, and Designation to who they are — for internal reference only, never printed on the quotation. Not an employee? Just type a role directly (e.g. &quot;Freelance Designer&quot;) and set the day rate — it costs into the budget the same way, with Designation left blank.</p>
            <datalist id="resource-employee-options">
              {resourceEmployees.map((e) => <option key={e.id} value={employeeLabel(e)} />)}
            </datalist>
          </div>

          {/* Payment Milestones */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Payment Milestones</h2>

            {status === 'APPROVED' && Array.isArray(existing?.paymentMilestones) && existing.paymentMilestones.length > 0 ? (
              <div className="space-y-2">
                {existing.paymentMilestones.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Milestone {m.sequence} — {Number(m.percentage)}% ({fmt(Number(m.amount))})</p>
                      {m.invoice && (
                        <p className="text-xs text-slate-400">
                          <Link href={`/dashboard/accounting/invoices/${m.invoice.id}`} className="text-amber-700 hover:underline">{m.invoice.invoiceNumber}</Link> — {m.invoice.status}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        // Keyed on scheduledDate too (not just m.id) so a
                        // successful reschedule — which invalidates and
                        // refetches this quotation — fully remounts this
                        // uncontrolled input instead of leaving the old
                        // date showing in an unchanged DOM node.
                        key={`${m.id}-${m.scheduledDate}`}
                        type="date"
                        defaultValue={dayjs(m.scheduledDate).format('YYYY-MM-DD')}
                        disabled={m.invoice?.status === 'PAID'}
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== dayjs(m.scheduledDate).format('YYYY-MM-DD')) handleRescheduleMilestone(m, e.target.value);
                        }}
                        className="px-2 py-1 border border-slate-300 rounded text-xs text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                        title={m.invoice?.status === 'PAID' ? 'Fully paid — date is locked' : 'Reschedule this milestone'}
                      />
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${m.status === 'INVOICED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{m.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : status === 'APPROVED' ? (
              <p className="text-xs text-slate-400">No payment milestones were configured — the full amount was invoiced on approval.</p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">Optional — split the quoted amount into staged invoices instead of one lump sum on approval. Leave empty to invoice the full amount once approved.</p>
                <div className="space-y-2">
                  {milestones.map((m, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">Milestone {idx + 1} — % of total</label>
                        <input type="number" min="0" step="0.01" value={m.percentage} onChange={(e) => updateMilestone(idx, 'percentage', e.target.value)} className={inputCls} placeholder="e.g. 50" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">{idx === 0 ? 'Invoiced on approval' : 'Days after previous milestone'}</label>
                        <input type="number" min="0" value={idx === 0 ? '0' : m.gapDays} disabled={idx === 0} onChange={(e) => updateMilestone(idx, 'gapDays', e.target.value)} className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`} placeholder="e.g. 15" />
                      </div>
                      <button type="button" onClick={() => removeMilestone(idx)} className="p-2 text-slate-400 hover:text-red-600" title="Remove milestone">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addMilestone} className="mt-2 flex items-center gap-1 text-sm text-amber-700 hover:text-amber-800 font-medium">
                  <PlusIcon className="h-4 w-4" /> Add Milestone
                </button>
                {milestones.length > 0 && (
                  <p className={`text-xs mt-2 ${milestoneError ? 'text-red-600' : 'text-green-600'}`}>
                    Total: {milestonesTotalPct}% {milestoneError ? `— ${milestoneError}` : '— OK'}
                  </p>
                )}
              </>
            )}
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

          {/* Terms & Conditions */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Terms &amp; Conditions</h2>
            {(companyProfile?.termsAndConditions || companyProfile?.paymentTerms || companyProfile?.warrantyTerms) && (
              <div className="mb-3">
                <p className="text-xs font-medium text-slate-500 mb-1">Standard Template (from Settings — applies to every quotation)</p>
                <div className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {[companyProfile.termsAndConditions, companyProfile.paymentTerms, companyProfile.warrantyTerms].filter(Boolean).join('\n\n')}
                </div>
              </div>
            )}
            <label className="block text-sm font-medium text-slate-700 mb-1">Additional Clauses (specific to this quotation)</label>
            <textarea
              value={additionalTerms}
              onChange={(e) => setAdditionalTerms(e.target.value)}
              rows={4}
              placeholder="Any extra terms or clauses that apply only to this quotation"
              className={inputCls}
            />
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
              <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">Admin / overhead</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-medium text-slate-700">{fmt(costing.adminCost)}</span>
                  <input type="number" min="0" value={adminValue} onChange={(e) => setAdminValue(e.target.value)} className="w-12 px-1 py-0.5 border border-slate-300 rounded text-xs text-right text-slate-800" />
                  <select value={adminMode} onChange={(e) => setAdminMode(e.target.value as CostMode)} className="px-1 py-0.5 border border-slate-300 rounded text-xs text-slate-700">
                    <option value="PCT">%</option>
                    <option value="FIXED">₹</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-between py-1 border-b border-dashed border-slate-100 font-semibold"><span className="text-slate-800">Base project cost</span><span className="font-mono text-slate-800">{fmt(costing.baseCost)}</span></div>
              <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">Markup</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-medium text-slate-700">{fmt(costing.markupAmount)}</span>
                  <input type="number" min="0" value={markupValue} onChange={(e) => setMarkupValue(e.target.value)} className="w-12 px-1 py-0.5 border border-slate-300 rounded text-xs text-right text-slate-800" />
                  <select value={markupMode} onChange={(e) => setMarkupMode(e.target.value as CostMode)} className="px-1 py-0.5 border border-slate-300 rounded text-xs text-slate-700">
                    <option value="PCT">%</option>
                    <option value="FIXED">₹</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-dashed border-slate-100">
                <span className="text-slate-500">Discount</span>
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-medium ${costing.discountAmount > 0 ? 'text-red-600' : 'text-slate-700'}`}>{costing.discountAmount > 0 ? '-' : ''}{fmt(costing.discountAmount)}</span>
                  <input type="number" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="w-12 px-1 py-0.5 border border-slate-300 rounded text-xs text-right text-slate-800" />
                  <select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as CostMode)} className="px-1 py-0.5 border border-slate-300 rounded text-xs text-slate-700">
                    <option value="PCT">%</option>
                    <option value="FIXED">₹</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">Tax</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-medium text-slate-700">{fmt(costing.taxAmount)}</span>
                  <input type="number" min="0" value={taxPercentage} onChange={(e) => setTaxPercentage(e.target.value)} className="w-12 px-1 py-0.5 border border-slate-300 rounded text-xs text-right text-slate-800" />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </div>
            </div>

            <div className="text-center my-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quoted Amount</p>
              <p className="text-3xl font-bold text-slate-800 mt-0.5">{fmt(costing.totalAmount)}</p>
              {costing.totalAmountOverridden && <p className="text-xs text-amber-600 mt-1">Overridden — system value was {fmt(costing.calculatedTotalAmount)}</p>}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-600">Final amount (override)</label>
                <input type="number" min="0" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} disabled={!canAuthorizeOverride} placeholder={fmt(costing.calculatedTotalAmount)} className="w-32 px-2 py-1.5 border border-slate-300 rounded text-sm text-right text-slate-800 disabled:bg-slate-100 disabled:text-slate-400" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                {canAuthorizeOverride
                  ? 'Leave blank to publish the system-calculated amount.'
                  : 'Requires authorization to override the calculated amount — ask a manager.'}
              </p>
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
