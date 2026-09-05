'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  CheckCircleIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  CurrencyDollarIcon,
  CalculatorIcon,
  ArrowDownTrayIcon,
  PencilIcon,
  TrashIcon,
  DocumentPlusIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { generateInvoicePDF } from '@/lib/generateInvoicePDF';
import { formatCurrency } from '@/lib/currency';
import CountrySelect, { type Country } from '@/components/CountrySelect';
import dayjs from 'dayjs';
import { usePermissions } from '@/hooks/usePermissions';
import { useProjectsForLead } from '@/hooks/useProjectsForLead';
import { useProductsForLead } from '@/hooks/useProductsForLead';
import { invalidateQuotationData } from '@/lib/queryInvalidation';
import { validateMilestonePlan, type MilestonePlanInput } from '@/lib/quotationMilestones';

const QUOTATION_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-slate-100 text-slate-700' },
  { value: 'SENT', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'NEGOTIATION', label: 'Negotiation', color: 'bg-amber-100 text-amber-700' },
  { value: 'APPROVED', label: 'Approved', color: 'bg-green-100 text-green-700' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-700' },
  { value: 'EXPIRED', label: 'Expired', color: 'bg-orange-100 text-orange-700' },
];

const MODULE_COLORS: Record<string, string> = {
  TRADING: 'bg-blue-100 text-blue-700',
  JEWELLERY: 'bg-amber-100 text-amber-700',
  MANUFACTURING: 'bg-purple-100 text-purple-700',
  ACCOUNTS: 'bg-green-100 text-green-700',
};

interface ModuleConfig { id: number; moduleCode: string; moduleName: string; description: string; baseLicenseCost: number; additionalUserCost: number; additionalBranchCost: number; }
interface ExistingLead { id: number; companyName: string; projectName: string | null; contactPerson: string; email: string | null; mobile: string | null; country: { isoCode: string; countryName: string; flagEmoji: string | null } | null; state: string | null; }
interface AddonConfig { id: number; addonCode: string; addonName: string; description: string; price: number; }
interface PricingResponse { currencyCode: string; currencySymbol: string; exchangeRate: number; modules: { moduleCode: string; moduleName: string; basePrice: number }[]; modulesSubtotal: number; implementationCost: number; trainingCost: number; cloudHostingCost: number; annualMaintenanceCost: number; supportCharges: number; addonsCost: number; subtotal: number; discountPercentage: number; discountAmount: number; taxInclusive: boolean; taxBreakdown: { taxName: string; rate: number; amount: number }[]; totalTax: number; grandTotal: number; addons: { addonCode: string; addonName: string; price: number }[]; }
interface ServiceOverrides { implementationCost?: number; trainingCost?: number; annualMaintenanceCost?: number; }
interface CustomModule { id: string; name: string; description: string; cost: number; quantity: number; }
interface CurrencyOption { currencyCode: string; currencySymbol: string; }
interface CompanyProfileTerms { termsAndConditions: string | null; paymentTerms: string | null; warrantyTerms: string | null }
interface QuotationRevisionEntry { id: number; versionNumber: number; snapshot: any; revisedByName: string | null; createdAt: string }

function fmt(amount: number, symbol: string, currencyCode: string): string {
  return formatCurrency(amount, currencyCode, { symbol });
}

// Catalog costs (module base license / addon price) are always stored in
// INR. Once pricing has been computed for a selected currency, any
// catalog price shown alongside it — including for modules/addons NOT yet
// selected — must be converted too, or it displays the raw INR number
// mislabeled with the client's currency symbol (e.g. "AED 350,000.00"
// instead of the actual ~AED 15,400 equivalent).
function catalogPriceInPricingCurrency(inrAmount: number, pricing: PricingResponse): number {
  if (pricing.currencyCode === 'INR') return inrAmount;
  return Math.round((inrAmount / pricing.exchangeRate) * 100) / 100;
}

export default function QuotationsPage() {
  const { has } = usePermissions();
  const canExport = has('export_quotations');
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-link from Product Master's "Budget Estimation"/"+ New Estimation"
  // actions (/dashboard/quotations?productId=..&leadId=..) — this is the
  // Product-side equivalent of the Calculator's own ?projectId=/?leadId=
  // prefill (see QuotationCalculatorForm's comment), just landing on this
  // page instead since Product Master uses this catalog-based form rather
  // than the Calculator (see ProductBudgetPanel's own comment for why).
  // leadId is whichever of Product.customerId/leadId is set. `?edit=<id>`
  // is this page's own deep-link for opening an existing quotation straight
  // into edit mode (used by ProductBudgetPanel's Edit action, since a
  // Product-linked quotation is always CATALOG-mode and must stay on this
  // form rather than the Calculator).
  const prefillProductId = searchParams.get('productId');
  const prefillLeadId = searchParams.get('leadId');
  const editParam = searchParams.get('edit');
  const [view, setView] = useState<'list' | 'create'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingQuotationNumber, setEditingQuotationNumber] = useState('');

  // Create state
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  // Which project (Project master) this quotation is for — the dropdown is
  // scoped to selectedLeadId (create) or editingLeadId (edit) via
  // useProjectsForLead below. `projectName` is kept in sync from whichever
  // project is picked (see the sync effect below) so the legacy text column
  // still gets written on save — it's stored on the Quotation itself, not
  // re-derived from the lead at read time. Kept separate from
  // newClientProjectName below so switching Existing Client <-> New Client
  // never copies one tab's Project Name into the other (New Client has no
  // lead yet, so it keeps its own free-text field instead of a dropdown).
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  // Which Product master row this quotation is for — same convention as
  // projectId above (a real dropdown next to Project, scoped the same way).
  // Also still set via the ?productId= deep-link from Product Master (see
  // ProductBudgetPanel) — that just pre-selects this same dropdown instead
  // of a separate read-only display.
  const [productId, setProductId] = useState('');
  // New Client mode's free-text Product Name — mirrors newClientProjectName
  // below. Unlike Project, there's no legacy productName column on
  // Quotation (a Product always needs an existing lead, which a brand-new
  // client doesn't have yet), so this is carried only inside
  // pricingSnapshot.productName once saved — informational only.
  const [newClientProductName, setNewClientProductName] = useState('');
  const [editingLeadId, setEditingLeadId] = useState('');
  const [newClientProjectName, setNewClientProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [moduleOverrides, setModuleOverrides] = useState<Record<string, number>>({});
  const [serviceOverrides, setServiceOverrides] = useState<ServiceOverrides>({});
  const [customModules, setCustomModules] = useState<CustomModule[]>([]);
  const [clientCountry, setClientCountry] = useState('IN');
  const [clientState, setClientState] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [additionalTerms, setAdditionalTerms] = useState('');
  // Payment Milestones — same shape/behavior as
  // QuotationCalculatorForm.tsx's own `milestones` state (an editable,
  // not-yet-approved plan of {percentage, gapDays} rows), reused byte-for-
  // byte here so a quotation created from this form (Product Master's own
  // flow, and any other catalog-based quotation) supports the exact same
  // milestone/invoice-generation behavior as a Calculator one — see
  // src/lib/quotationMilestones.ts / quotationMilestoneInvoicing.ts, both
  // already costingMode-agnostic.
  const [milestones, setMilestones] = useState<{ percentage: string; gapDays: string }[]>([]);
  // Already-materialized QuotationPaymentMilestone rows (dated, with their
  // own invoice + status) — only populated once editing an APPROVED
  // quotation; read-only display, same as the Calculator's own
  // `existing.paymentMilestones`.
  const [existingMilestones, setExistingMilestones] = useState<any[]>([]);
  // The quotation's own stored status, once editing one — needed to decide
  // whether to show the editable plan or the already-materialized rows
  // (same role as the Calculator's own local `status` state).
  const [editingStatus, setEditingStatus] = useState('DRAFT');

  const resetCreateState = () => {
    setEditingId(null); setEditingQuotationNumber('');
    setSelectedModules([]); setModuleOverrides({}); setServiceOverrides({}); setCustomModules([]); setClientName(''); setCompanyName(''); setClientEmail(''); setClientPhone(''); setProjectName(''); setNewClientProjectName(''); setProjectId(''); setProductId(''); setNewClientProductName(''); setEditingLeadId('');
    setClientCountry('IN'); setClientState(''); setDiscountPercentage(0); setTaxInclusive(false); setSelectedAddons([]); setPricing(null);
    setClientMode('existing'); setSelectedLeadId(''); setFormErrors({}); setAdditionalTerms('');
    setMilestones([]); setExistingMilestones([]); setEditingStatus('DRAFT');
  };

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

  const rescheduleMutation = useMutation({
    mutationFn: async ({ milestoneId, newScheduledDate, reason }: { milestoneId: number; newScheduledDate: string; reason?: string }) => {
      const res = await fetch(`/api/quotations/${editingId}/milestones/${milestoneId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newScheduledDate, reason }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to reschedule milestone'); }
      return res.json();
    },
    onSuccess: () => { if (editingId) openEdit(editingId); toast.success('Milestone rescheduled'); },
    onError: (err: Error) => toast.error(err.message),
  });

  // A milestone whose invoice has already been partially paid needs a reason
  // on record (enforced again server-side — see the reschedule route) since
  // money has already moved against the date being changed; one that's
  // unpaid or not yet invoiced needs no such friction. Same rule as the
  // Calculator's own handleRescheduleMilestone.
  const handleRescheduleMilestone = (milestone: any, newDateStr: string) => {
    let reason: string | undefined;
    if (milestone.invoice?.status === 'PARTIALLY_PAID') {
      const entered = window.prompt('This milestone has already been partially paid — enter a reason for rescheduling it:');
      if (!entered || !entered.trim()) { toast.error('A reason is required to reschedule a partially paid milestone'); return; }
      reason = entered.trim();
    }
    rescheduleMutation.mutate({ milestoneId: milestone.id, newScheduledDate: newDateStr, reason });
  };

  // Project dropdown, scoped to whichever Lead/Customer is active — create
  // uses selectedLeadId, editing uses editingLeadId (leadId isn't tracked in
  // `form` state here since the client section is a locked read-only block
  // once editing). See useProjectsForLead's own comment for the relation
  // this filters on.
  const activeLeadIdForProjects = editingId ? editingLeadId : (clientMode === 'existing' ? selectedLeadId : '');
  const { data: leadProjects = [], isLoading: projectsLoading } = useProjectsForLead(activeLeadIdForProjects);
  // Keeps the legacy free-text projectName column (still used for
  // display/PDF/search) in sync with whichever project is selected.
  useEffect(() => {
    const p = leadProjects.find((x) => String(x.id) === projectId);
    if (p) setProjectName(p.projectName);
  }, [projectId, leadProjects]);
  // Product dropdown, scoped the same way as Project above — same
  // activeLeadIdForProjects, just against Product Master instead.
  const { data: leadProducts = [], isLoading: productsLoading } = useProductsForLead(activeLeadIdForProjects);
  // Project and Product are mutually exclusive on a quotation — a customer
  // picks one or the other, never both (enforced again server-side, see
  // POST/PUT /api/quotations); neither is auto-selected, even when a
  // customer has only one Project or Product — the user always picks
  // explicitly (see the disabled/placeholder logic on each <select> below).

  // Search + Status filter — same debounced searchInput/search pattern and
  // Filters-toggle-reveals-a-panel behavior as the Customer module
  // (src/app/dashboard/customers/page.tsx), reusing the existing
  // QUOTATION_STATUSES constant (already used by the per-row Status select
  // below) for the filter dropdown's options. Unlike Customers, there's no
  // pagination UI on this page today, so search/status are added as extra
  // query params to the existing fixed size=50 fetch rather than
  // introducing new page/size state — pagination stays exactly as-is.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const quotationsParams: Record<string, string> = { size: '50' };
  if (search) quotationsParams.search = search;
  if (statusFilter) quotationsParams.status = statusFilter;

  const clearQuotationFilters = () => { setSearchInput(''); setSearch(''); setStatusFilter(''); };

  // Fetch quotations from database
  const { data: quotationsData, isError: isQuotationsError } = useQuery({
    queryKey: ['quotations', quotationsParams],
    queryFn: async () => {
      const query = new URLSearchParams(quotationsParams).toString();
      const r = await fetch(`/api/quotations?${query}`);
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    placeholderData: (prev: any) => prev,
  });
  const quotations = quotationsData?.content || [];

  // Fetch modules and addons
  const { data: modules = [], isError: isModulesError } = useQuery<ModuleConfig[]>({
    queryKey: ['modules'],
    queryFn: async () => { const r = await fetch('/api/quotation-config'); if (!r.ok) throw new Error('Failed to fetch modules'); return r.json(); },
  });
  const { data: addons = [], isError: isAddonsError } = useQuery<AddonConfig[]>({
    queryKey: ['addons'],
    queryFn: async () => { const r = await fetch('/api/quotation-config?type=addons'); if (!r.ok) throw new Error('Failed to fetch addons'); return r.json(); },
  });
  const { data: states = [], isError: isStatesError } = useQuery<{ stateCode: string; stateName: string }[]>({
    queryKey: ['states', clientCountry],
    queryFn: async () => { const r = await fetch(`/api/quotation-config/taxes?type=states&country=${clientCountry}`); if (!r.ok) throw new Error('Failed to fetch states'); return r.json(); },
    enabled: !!clientCountry,
  });
  const { data: existingLeads = [], isError: isLeadsError } = useQuery<ExistingLead[]>({
    queryKey: ['leads-for-quotation'],
    queryFn: async () => { const r = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc'); if (!r.ok) throw new Error('Failed to fetch leads'); const data = await r.json(); return data.content; },
  });
  // Shared with CountrySelect's own internal fetch (same query key), so this
  // doesn't cost an extra request — needed here to resolve clientCountry
  // (an ISO code, the format the calculate API and Quotation.clientCountry
  // use) to/from the numeric Country id CountrySelect's `value` prop expects.
  const { data: countryList = [], isError: isCountryListError } = useQuery<Country[]>({
    queryKey: ['countries'],
    queryFn: async () => { const r = await fetch('/api/countries?activeOnly=true'); if (!r.ok) throw new Error('Failed to fetch countries'); return r.json(); },
  });
  const { data: currencyList = [], isError: isCurrencyListError } = useQuery<CurrencyOption[]>({
    queryKey: ['currencies'],
    queryFn: async () => { const r = await fetch('/api/currencies?activeOnly=true'); if (!r.ok) throw new Error('Failed to fetch currencies'); return r.json(); },
  });
  const { data: companyProfile } = useQuery<CompanyProfileTerms | null>({
    queryKey: ['company-profile-terms'],
    queryFn: async () => { const r = await fetch('/api/quotation-config?type=company-profile'); if (!r.ok) throw new Error('Failed to fetch company profile'); return r.json(); },
  });
  const standardTermsText = companyProfile
    ? [companyProfile.termsAndConditions, companyProfile.paymentTerms, companyProfile.warrantyTerms].filter(Boolean).join('\n\n')
    : '';

  const [historyFor, setHistoryFor] = useState<{ id: number; quotationNumber: string; version: number } | null>(null);
  const { data: revisions = [], isLoading: revisionsLoading } = useQuery<QuotationRevisionEntry[]>({
    queryKey: ['quotation-revisions', historyFor?.id],
    queryFn: async () => { const r = await fetch(`/api/quotations/${historyFor!.id}/revisions`); if (!r.ok) throw new Error('Failed to load history'); return r.json(); },
    enabled: !!historyFor,
  });
  const symbolForCurrency = (code: string) => currencyList.find(c => c.currencyCode === code)?.currencySymbol || code;

  useEffect(() => {
    if (isQuotationsError) toast.error('Failed to load quotations');
  }, [isQuotationsError]);
  useEffect(() => {
    if (isModulesError) toast.error('Failed to load modules');
  }, [isModulesError]);
  useEffect(() => {
    if (isAddonsError) toast.error('Failed to load add-ons');
  }, [isAddonsError]);
  useEffect(() => {
    if (isStatesError) toast.error('Failed to load states');
  }, [isStatesError]);
  useEffect(() => {
    if (isLeadsError) toast.error('Failed to load clients');
  }, [isLeadsError]);
  useEffect(() => {
    if (isCountryListError) toast.error('Failed to load countries');
  }, [isCountryListError]);
  useEffect(() => {
    if (isCurrencyListError) toast.error('Failed to load currencies');
  }, [isCurrencyListError]);

  const selectExistingLead = (id: string) => {
    setSelectedLeadId(id);
    const lead = existingLeads.find(l => String(l.id) === id);
    setClientName(lead?.contactPerson || '');
    setCompanyName(lead?.companyName || '');
    setClientEmail(lead?.email || '');
    setClientPhone(lead?.mobile || '');
    // Reset the Project/Product selections — the previous picks belonged to
    // whichever lead was selected before, and must not carry over. Both
    // dropdowns (scoped to this new leadId) repopulate via the queries above.
    setProjectId(''); setProjectName('');
    setProductId('');
    // Currency/tax must follow the lead — country isn't independently
    // re-picked once an existing client is selected (see countryLocked).
    setClientCountry(lead?.country?.isoCode || 'IN');
    setClientState(lead?.state || '');
  };

  // Quoting an existing lead (or editing an already-saved quotation, whose
  // client is likewise locked) means currency must follow that lead/quote's
  // own country rather than being re-picked here.
  const countryLocked = !!editingId || clientMode === 'existing';

  // Auto-calculate pricing
  const calcMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch('/api/quotation-config/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!r.ok) throw new Error('Failed to calculate pricing');
      return r.json();
    },
    onSuccess: (data) => setPricing(data),
    onError: () => toast.error('Failed to calculate pricing'),
  });

  const hasCustomModules = customModules.some(c => c.name && c.cost > 0);
  useEffect(() => {
    if ((selectedModules.length > 0 || hasCustomModules) && clientCountry) {
      const t = setTimeout(() => {
        calcMutation.mutate({ moduleCodes: selectedModules, clientCountry, clientState: clientState || undefined, discountPercentage: discountPercentage || undefined, addonCodes: selectedAddons.length > 0 ? selectedAddons : undefined, moduleOverrides: Object.keys(moduleOverrides).length > 0 ? moduleOverrides : undefined, serviceOverrides: Object.keys(serviceOverrides).length > 0 ? serviceOverrides : undefined, taxInclusive });
      }, 300);
      return () => clearTimeout(t);
    } else { setPricing(null); }
  }, [selectedModules, hasCustomModules, clientCountry, clientState, discountPercentage, selectedAddons, moduleOverrides, serviceOverrides, taxInclusive]);

  const toggleModule = (code: string) => {
    const isSelected = selectedModules.includes(code);
    setSelectedModules(prev => isSelected ? prev.filter(c => c !== code) : [...prev, code]);
    if (isSelected) setModuleOverrides(prev => { const { [code]: _drop, ...rest } = prev; return rest; });
  };
  const updateModuleOverride = (code: string, value: number) => setModuleOverrides(prev => ({ ...prev, [code]: value }));
  const updateServiceOverride = (field: keyof ServiceOverrides, value: number) => setServiceOverrides(prev => ({ ...prev, [field]: value }));
  const toggleAddon = (code: string) => setSelectedAddons(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  const addCustomModule = () => setCustomModules(prev => [...prev, { id: Date.now().toString(), name: '', description: '', cost: 0, quantity: 1 }]);
  const removeCustomModule = (id: string) => setCustomModules(prev => prev.filter(m => m.id !== id));
  const updateCustomModule = (id: string, field: keyof CustomModule, value: any) => setCustomModules(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  const customModulesTotal = customModules.reduce((sum, m) => sum + (m.cost * m.quantity), 0);

  const saveQuotation = async () => {
    const clientValid = editingId || (clientMode === 'existing' ? !!selectedLeadId : !!(clientName && companyName));
    const hasModule = selectedModules.length > 0 || customModules.filter(c => c.name && c.cost > 0).length > 0;
    const errs: Record<string, string> = {};
    if (!editingId && clientMode === 'existing' && !selectedLeadId) errs.client = 'Select a client';
    if (!editingId && clientMode === 'new') {
      if (!clientName) errs.clientName = 'Client name is required';
      if (!companyName) errs.companyName = 'Company is required';
    }
    if (!hasModule) errs.modules = 'Select at least one module';
    setFormErrors(errs);
    if (!pricing || !clientValid || !hasModule) {
      toast.error(clientMode === 'existing' && !editingId ? 'Select a client and at least one module' : 'Fill required fields and select at least one module');
      return;
    }
    if (milestoneError) { toast.error(milestoneError); return; }
    try {
      // Existing-client mode (and editing) use `projectName`; a brand-new
      // client being created here uses its own, separate state — never mix
      // the two up when saving.
      const effectiveProjectName = (!editingId && clientMode === 'new') ? newClientProjectName : projectName;
      // New-client mode has no lead yet to scope a Project dropdown to, so
      // it never sets projectId — only the free-text projectName above.
      const effectiveProjectId = (!editingId && clientMode === 'new') ? null : (projectId ? parseInt(projectId) : null);
      // Same reasoning for productId — New Client mode has no lead yet to
      // scope a Product dropdown to (same as Project above), so it never
      // sets productId — only the free-text newClientProductName below.
      const effectiveProductId = (!editingId && clientMode === 'new') ? null : (productId ? parseInt(productId) : null);
      // Preserves whatever New Client-mode free text this quotation was
      // originally created with once editing (there's no UI to edit it once
      // a real lead/productId exists — see the Client Information card
      // below), same convention as projectName vs. newClientProjectName.
      const effectiveProductName = (editingId || (!editingId && clientMode === 'new')) ? (newClientProductName || null) : null;
      const sharedFields = {
        softwareModules: [...selectedModules, ...customModules.filter(c => c.name).map(c => ({ name: c.name, cost: c.cost, quantity: c.quantity }))],
        businessModule: selectedModules[0] || null,
        projectName: effectiveProjectName || null,
        projectId: effectiveProjectId,
        productId: effectiveProductId,
        clientCountry,
        clientState: clientState || null,
        currencyCode: pricing.currencyCode,
        exchangeRate: pricing.exchangeRate,
        totalAmount: pricing.grandTotal + customModulesTotal,
        implementationCost: pricing.implementationCost,
        trainingCost: pricing.trainingCost,
        annualMaintenance: pricing.annualMaintenanceCost,
        customDevelopmentCost: customModulesTotal > 0 ? customModulesTotal : null,
        discountPercentage: pricing.discountPercentage || null,
        discountAmount: pricing.discountAmount || null,
        taxAmount: pricing.totalTax || null,
        taxInclusive: pricing.taxInclusive,
        taxBreakdown: pricing.taxBreakdown,
        addons: selectedAddons,
        // Same nested-under-pricingSnapshot placement PUT already expects
        // (see /api/quotations/[id]/route.ts's own paymentMilestones
        // check) and POST's CATALOG branch now validates identically — an
        // empty array is a valid "no milestones, one lump-sum invoice on
        // approval" plan, same as the Calculator sending one.
        pricingSnapshot: { ...pricing, paymentMilestones: milestonePlan, productName: effectiveProductName },
        additionalTerms: additionalTerms || null,
      };
      // On create: existing-client mode links to the picked lead via leadId;
      // new-client mode sends company/contact fields so the API creates a
      // fresh lead. Neither applies once editing (client is locked to the lead).
      const body = editingId
        ? sharedFields
        : clientMode === 'existing'
          ? { leadId: selectedLeadId, ...sharedFields }
          : { companyName, clientName, clientEmail, clientPhone, ...sharedFields };
      const url = editingId ? `/api/quotations/${editingId}` : '/api/quotations';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Failed to save');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      invalidateQuotationData(queryClient);
      toast.success(editingId ? 'Quotation updated!' : 'Quotation saved!');
      // Arrived here from Product Master's Budget Estimation / "+ New
      // Estimation" (this quotation carries a productId either way — via
      // the deep-link prefill on create, or because openEdit loaded one on
      // edit) — send the user back to that product's own accordion so the
      // saved quotation is immediately visible, same convention as the
      // Calculator's own post-save redirect to /dashboard/projects?expand=.
      if (effectiveProductId) { router.push(`/dashboard/products?expand=${effectiveProductId}`); return; }
      resetCreateState();
      setView('list');
    } catch {
      toast.error(editingId ? 'Failed to update quotation' : 'Failed to save quotation');
    }
  };

  const openEdit = async (id: number) => {
    const res = await fetch(`/api/quotations/${id}`);
    if (!res.ok) { toast.error('Failed to load quotation'); return; }
    const q = await res.json();
    const sw = Array.isArray(q.softwareModules) ? q.softwareModules : [];
    setSelectedModules(sw.filter((m: any) => typeof m === 'string'));
    setCustomModules(sw.filter((m: any) => m && typeof m === 'object').map((m: any, i: number) => ({
      id: `${Date.now()}-${i}`, name: m.name || '', description: m.description || '', cost: Number(m.cost) || 0, quantity: Number(m.quantity) || 1,
    })));
    // Restore the exact per-module amounts this quotation was quoted at
    // (which may have been overridden from catalog price), rather than
    // letting the calc effect silently replace them with today's catalog
    // price/exchange rate.
    const snapshotModules = q.pricingSnapshot?.modules;
    setModuleOverrides(Array.isArray(snapshotModules)
      ? snapshotModules.reduce((acc: Record<string, number>, m: any) => {
          if (m?.moduleCode) acc[m.moduleCode] = Number(m.basePrice);
          return acc;
        }, {})
      : {});
    // Same reasoning as moduleOverrides above — restore the exact service
    // amounts this quotation was quoted at, not today's catalog defaults.
    setServiceOverrides({
      implementationCost: Number(q.implementationCost) || 0,
      trainingCost: Number(q.trainingCost) || 0,
      annualMaintenanceCost: Number(q.annualMaintenance) || 0,
    });
    setClientName(q.lead?.contactPerson || '');
    setCompanyName(q.lead?.companyName || '');
    setClientEmail(q.lead?.email || '');
    setClientPhone(q.lead?.mobile || '');
    // The quotation's own stored Project — not re-derived from the lead's
    // current value, so a per-quotation edit here is never silently
    // overwritten. projectName is the initial display value; once
    // leadProjects loads, the sync effect above re-derives it from
    // projectId (a no-op unless the two have drifted).
    setProjectName(q.projectName || '');
    setProjectId(q.projectId ? String(q.projectId) : '');
    setProductId(q.productId ? String(q.productId) : '');
    setNewClientProductName(q.pricingSnapshot?.productName || '');
    setEditingLeadId(q.leadId ? String(q.leadId) : '');
    setClientCountry(q.clientCountry || 'IN');
    setClientState(q.clientState || '');
    setDiscountPercentage(Number(q.discountPercentage) || 0);
    setTaxInclusive(!!q.taxInclusive);
    setSelectedAddons(Array.isArray(q.addons) ? q.addons : []);
    setAdditionalTerms(q.additionalTerms || '');
    // Same two-branch read as QuotationCalculatorForm.tsx's own populate
    // effect: the still-editable plan lives in pricingSnapshot.paymentMilestones
    // (rehydrated into the editable `milestones` state); once APPROVED, the
    // real materialized QuotationPaymentMilestone rows (with their own
    // invoice + status) are what GET /api/quotations/[id] already returns
    // under q.paymentMilestones — both are always present in this same
    // response, this form just wasn't reading either one until now.
    const snapMilestones = q.pricingSnapshot?.paymentMilestones;
    setMilestones(
      Array.isArray(snapMilestones)
        ? snapMilestones.map((m: any) => ({ percentage: String(m.percentage ?? ''), gapDays: String(m.gapDays ?? '') }))
        : []
    );
    setExistingMilestones(Array.isArray(q.paymentMilestones) ? q.paymentMilestones : []);
    setEditingStatus(q.status || 'DRAFT');
    setEditingId(q.id);
    setEditingQuotationNumber(q.quotationNumber);
    setView('create');
  };

  // ?edit=<id> deep-link — ProductBudgetPanel's Edit action (see its own
  // comment for why a Product-linked quotation must land here rather than
  // the Calculator). A ref, not state, so a later navigation with the same
  // param (or a manual "Back to List" then re-edit) isn't silently ignored.
  const editDeepLinkHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!editParam || editDeepLinkHandled.current === editParam) return;
    editDeepLinkHandled.current = editParam;
    openEdit(parseInt(editParam));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openEdit is
    // stable enough for this one-shot deep-link effect; re-running it on
    // every openEdit identity change would re-fetch/reset the form mid-edit.
  }, [editParam]);

  // ?productId=<id>&leadId=<id> deep-link — Product Master's own "Budget
  // Estimation"/"+ New Estimation" actions (see ProductBudgetPanel). Waits
  // for existingLeads to load so selectExistingLead (which reads from it)
  // has something to find; a ref guards against re-running the moment
  // existingLeads finishes loading a second time (e.g. a background
  // refetch) after the user has already started editing the form.
  const productDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (productDeepLinkHandled.current || !prefillProductId || !prefillLeadId) return;
    if (existingLeads.length === 0) return;
    if (!existingLeads.some((l) => String(l.id) === prefillLeadId)) return;
    productDeepLinkHandled.current = true;
    resetCreateState();
    setView('create');
    setClientMode('existing');
    selectExistingLead(prefillLeadId);
    setProductId(prefillProductId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // omits resetCreateState/selectExistingLead (stable enough here, and
    // including them would re-fire this on every render).
  }, [prefillProductId, prefillLeadId, existingLeads]);

  const deleteQuotation = async (id: number, quotationNumber: string) => {
    if (!window.confirm(`Delete quotation "${quotationNumber}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete quotation'); return; }
    queryClient.invalidateQueries({ queryKey: ['quotations'] });
    invalidateQuotationData(queryClient);
    toast.success('Quotation deleted');
  };

  const updateStatus = async (id: number, status: string) => {
    const res = await fetch(`/api/quotations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.message || 'Failed to update status');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['quotations'] });
    queryClient.invalidateQueries({ queryKey: ['accounting-invoices'] });
    invalidateQuotationData(queryClient);
    const updated = await res.json();
    if (updated.generatedInvoice) {
      toast.success(`Quotation approved — Invoice ${updated.generatedInvoice.invoiceNumber} created in Pending Invoices`);
    } else {
      toast.success('Status updated');
    }
  };

  // Auto-generated when a quotation is approved (see updateStatus above) —
  // this button stays as a manual fallback for quotations that were already
  // APPROVED before that existed. The API dedupes, so a click here after an
  // invoice already exists just jumps to it instead of erroring.
  const generateInvoice = async (q: any) => {
    if (!window.confirm(`Generate an invoice from quotation ${q.quotationNumber}?`)) return;
    const dueDate = dayjs().add(30, 'day').format('YYYY-MM-DD');
    const res = await fetch('/api/accounting/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: q.leadId, quotationId: q.id, dueDate }),
    });
    if (res.status === 409) {
      const err = await res.json();
      toast.success('Invoice already exists for this quotation');
      if (err.invoiceId) router.push(`/dashboard/accounting/invoices/${err.invoiceId}`);
      return;
    }
    if (!res.ok) {
      const err = await res.json();
      toast.error(err.message || 'Failed to generate invoice');
      return;
    }
    const invoice = await res.json();
    toast.success(`Invoice ${invoice.invoiceNumber} created`);
    router.push(`/dashboard/accounting/invoices/${invoice.id}`);
  };

  const downloadPDF = () => {
    if (!pricing) return;
    const symbol = pricing.currencySymbol;
    generateInvoicePDF({
      quotationNumber: `QTN-${dayjs().format('YYYYMMDD-HHmm')}`,
      date: dayjs().format('DD MMM, YYYY'),
      clientName,
      companyName,
      clientEmail,
      clientPhone,
      modules: [
        ...pricing.modules.map(m => ({ name: m.moduleName, description: '', quantity: 1, unitPrice: m.basePrice, total: m.basePrice })),
        ...customModules.filter(c => c.name && c.cost > 0).map(c => ({ name: c.name, description: c.description, quantity: c.quantity, unitPrice: c.cost, total: c.cost * c.quantity })),
      ],
      implementationCost: pricing.implementationCost,
      trainingCost: pricing.trainingCost,
      annualMaintenanceCost: pricing.annualMaintenanceCost,
      subtotal: pricing.subtotal + customModulesTotal,
      discountPercentage: pricing.discountPercentage,
      discountAmount: pricing.discountAmount,
      taxInclusive: pricing.taxInclusive,
      taxBreakdown: pricing.taxBreakdown,
      grandTotal: pricing.grandTotal + customModulesTotal,
      currencySymbol: symbol,
      currencyCode: pricing.currencyCode,
      fileName: `Quotation_${companyName || 'Client'}_${dayjs().format('YYYYMMDD')}.pdf`,
      standardTerms: standardTermsText,
      additionalTerms,
    });
  };

  // Resource-based (Quotation Calculator) quotations carry their line items
  // in pricingSnapshot.resources rather than softwareModules — mirrors the
  // same branch added to lineItemsFromQuotation (src/lib/invoiceFromQuotation.ts)
  // for invoice generation, kept separate since this one runs client-side.
  const downloadResourceBasedQuotationPDF = (q: any) => {
    const snapshot = q.pricingSnapshot as any;
    const resources = Array.isArray(snapshot?.resources) ? snapshot.resources : [];
    const symbol = symbolForCurrency(q.currencyCode || 'INR');

    const modules = resources.map((r: any) => ({
      name: r.role || 'Resource',
      description: '',
      quantity: Number(r.qty) || 0,
      unitPrice: (Number(r.durationDays) || 0) * (Number(r.dayRate) || 0),
      total: (Number(r.qty) || 0) * (Number(r.durationDays) || 0) * (Number(r.dayRate) || 0),
    }));
    const extra: { label: string; cost: number }[] = [
      { label: 'Outsourcing', cost: Number(q.outsourcingCost) || 0 },
      { label: 'Travel / Other', cost: Number(q.travelCost) || 0 },
      { label: 'Admin / Overhead', cost: Number(q.adminCost) || 0 },
      { label: 'Markup', cost: Number(q.markupAmount) || 0 },
    ];
    for (const e of extra) {
      if (e.cost > 0) modules.push({ name: e.label, description: '', quantity: 1, unitPrice: e.cost, total: e.cost });
    }
    const subtotal = modules.reduce((sum: number, m: any) => sum + m.total, 0);

    generateInvoicePDF({
      quotationNumber: q.quotationNumber,
      date: dayjs(q.createdAt).format('DD MMM, YYYY'),
      clientName: q.contactPerson || '',
      companyName: q.companyName || '',
      clientEmail: '',
      clientPhone: '',
      modules,
      implementationCost: 0,
      trainingCost: 0,
      annualMaintenanceCost: 0,
      subtotal,
      discountPercentage: Number(q.discountPercentage) || 0,
      discountAmount: Number(q.discountAmount) || 0,
      billingAddressLines: q.legalEntity ? [q.legalEntity.legalName, ...q.legalEntity.addressLines, q.legalEntity.countryName].filter(Boolean) : undefined,
      taxRegistrationNumber: q.legalEntity?.taxRegistrationNumber || undefined,
      taxInclusive: false,
      taxBreakdown: [],
      grandTotal: Number(q.totalAmount),
      currencySymbol: symbol,
      currencyCode: q.currencyCode || 'INR',
      fileName: `${q.quotationNumber}_${q.companyName}.pdf`,
      standardTerms: standardTermsText,
      additionalTerms: q.additionalTerms || '',
    });
  };

  const downloadQuotationPDF = (q: any) => {
    if (q.costingMode === 'RESOURCE_BASED') { downloadResourceBasedQuotationPDF(q); return; }

    const snapshot = q.pricingSnapshot as any;
    const modulesList = Array.isArray(q.softwareModules) ? q.softwareModules : [];
    const symbol = snapshot?.currencySymbol || '₹';

    const modules = snapshot?.modules?.length > 0
      ? snapshot.modules.map((m: any) => ({ name: m.moduleName, description: '', quantity: 1, unitPrice: Number(m.basePrice), total: Number(m.basePrice) }))
      : modulesList.map((m: any) => {
          const name = typeof m === 'string' ? m : m.name || m.moduleCode || '';
          const cost = typeof m === 'object' && m.cost ? Number(m.cost) : 0;
          const qty = typeof m === 'object' && m.quantity ? Number(m.quantity) : 1;
          return { name, description: '', quantity: qty, unitPrice: cost, total: cost * qty };
        });

    generateInvoicePDF({
      quotationNumber: q.quotationNumber,
      date: dayjs(q.createdAt).format('DD MMM, YYYY'),
      clientName: q.contactPerson || '',
      companyName: q.companyName || '',
      clientEmail: '',
      clientPhone: '',
      modules,
      implementationCost: snapshot?.implementationCost || 0,
      trainingCost: snapshot?.trainingCost || 0,
      annualMaintenanceCost: snapshot?.annualMaintenanceCost || 0,
      subtotal: snapshot?.subtotal || Number(q.totalAmount),
      discountPercentage: snapshot?.discountPercentage || 0,
      discountAmount: snapshot?.discountAmount || 0,
      billingAddressLines: q.legalEntity ? [q.legalEntity.legalName, ...q.legalEntity.addressLines, q.legalEntity.countryName].filter(Boolean) : undefined,
      taxRegistrationNumber: q.legalEntity?.taxRegistrationNumber || undefined,
      taxInclusive: !!q.taxInclusive,
      taxBreakdown: snapshot?.taxBreakdown || [],
      grandTotal: Number(q.totalAmount),
      currencySymbol: symbol,
      currencyCode: q.currencyCode || 'INR',
      fileName: `${q.quotationNumber}_${q.companyName}.pdf`,
      standardTerms: standardTermsText,
      additionalTerms: q.additionalTerms || '',
    });
  };

  // === LIST VIEW ===
  if (view === 'list') return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Quotations</h1><p className="text-slate-500 mt-1">Manage quotations</p></div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/quotations/calculator" className="flex items-center gap-2 px-4 py-2 border border-amber-600 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-50"><CalculatorIcon className="h-4 w-4" /> New (Resource Calculator)</Link>
          <button onClick={() => { resetCreateState(); setView('create'); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"><PlusIcon className="h-4 w-4" /> New Quotation</button>
        </div>
      </div>

      {/* Search & Filters — same bordered-card layout, debounced search
          input, and Filters-toggle-reveals-a-panel behavior as the
          Customer module (src/app/dashboard/customers/page.tsx). */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by quote no, client, company, project..."
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
          <button onClick={() => setFiltersOpen(!filtersOpen)} className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-medium ${statusFilter ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-300 text-slate-600'}`}>
            <FunnelIcon className="h-4 w-4" /> Filters {statusFilter && <span className="bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">1</span>}
          </button>
          {(searchInput || statusFilter) && <button onClick={clearQuotationFilters} className="text-sm text-slate-500 hover:text-red-500">Clear All</button>}
        </div>
        {filtersOpen && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800">
                <option value="">All</option>
                {QUOTATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {quotations.length === 0 ? (
          <div className="text-center py-16">
            <CalculatorIcon className="h-12 w-12 mx-auto text-slate-300" />
            <p className="mt-4 text-lg font-medium text-slate-600">{search || statusFilter ? 'No quotations found' : 'No quotations yet'}</p>
            <p className="text-sm text-slate-400">{search || statusFilter ? 'Try adjusting your search or filters' : 'Create your first quotation'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-900"><tr>
              <th className="px-4 py-3 text-left font-semibold text-white">Quote No</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Client</th>
              <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Project Name</th>
              <th className="px-4 py-3 text-left font-semibold text-white hidden md:table-cell">Product Name</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Modules</th>
              <th className="px-4 py-3 text-right font-semibold text-white">Amount</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-white">Actions</th>
            </tr></thead>
            <tbody>
              {quotations.map((q: any, idx: number) => {
                const isResourceBased = q.costingMode === 'RESOURCE_BASED';
                const modulesList = Array.isArray(q.softwareModules) ? q.softwareModules : [];
                const moduleNames = modulesList.map((m: any) => typeof m === 'string' ? m : m.name || m.moduleCode || '');
                return (
                <tr key={q.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span>{q.quotationNumber}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500">v{q.version || 1}</span>
                    </div>
                    {isResourceBased && <span className="block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-teal-100 text-teal-700 w-fit">Calculator</span>}
                  </td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{q.contactPerson}</p><p className="text-xs text-slate-500">{q.companyName}</p></td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{q.projectName || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{q.productName || '—'}</td>
                  <td className="px-4 py-3">
                    {isResourceBased ? (
                      <span className="text-xs text-slate-500">{q.projectName || 'Resource-based'}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">{moduleNames.slice(0, 3).map((m: string, i: number) => <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${MODULE_COLORS[m] || 'bg-orange-100 text-orange-700'}`}>{m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()}</span>)}{moduleNames.length > 3 && <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">+{moduleNames.length - 3}</span>}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(Number(q.totalAmount || 0), symbolForCurrency(q.currencyCode || 'INR'), q.currencyCode || 'INR')}</td>
                  <td className="px-4 py-3">
                    <select
                      value={q.status}
                      onChange={(e) => updateStatus(q.id, e.target.value)}
                      className={`px-2 py-1 rounded text-xs font-medium border-0 ${QUOTATION_STATUSES.find(s => s.value === q.status)?.color || 'bg-slate-100 text-slate-700'}`}
                    >
                      {QUOTATION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{dayjs(q.createdAt).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setHistoryFor({ id: q.id, quotationNumber: q.quotationNumber, version: q.version || 1 })} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Version History"><ClockIcon className="h-4 w-4" /></button>
                      {canExport && (
                        <button onClick={() => downloadQuotationPDF(q)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Download PDF"><ArrowDownTrayIcon className="h-4 w-4" /></button>
                      )}
                      {q.status === 'APPROVED' && (
                        <button onClick={() => generateInvoice(q)} className="p-1.5 rounded text-slate-400 hover:text-green-600 hover:bg-green-50" title="Generate Invoice"><DocumentPlusIcon className="h-4 w-4" /></button>
                      )}
                      {isResourceBased ? (
                        <Link href={`/dashboard/quotations/calculator/${q.id}`} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit"><PencilIcon className="h-4 w-4" /></Link>
                      ) : (
                        <button onClick={() => openEdit(q.id)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                      )}
                      <button onClick={() => deleteQuotation(q.id, q.quotationNumber)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>

      {historyFor && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Version History — {historyFor.quotationNumber}</h3>
                <p className="text-xs text-slate-500">Current version: v{historyFor.version}</p>
              </div>
              <button onClick={() => setHistoryFor(null)} className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"><XMarkIcon className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto p-4">
              {revisionsLoading ? (
                <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
              ) : revisions.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No prior revisions — this is the original version.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-200">
                    <th className="text-left pb-2">Version</th>
                    <th className="text-left pb-2">Date</th>
                    <th className="text-left pb-2">Revised By</th>
                    <th className="text-right pb-2">Total Amount</th>
                    <th className="text-left pb-2">Status</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {revisions.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 font-medium text-slate-700">v{r.versionNumber}</td>
                        <td className="py-2 text-slate-500">{dayjs(r.createdAt).format('DD MMM YYYY, HH:mm')}</td>
                        <td className="py-2 text-slate-500">{r.revisedByName || '—'}</td>
                        <td className="py-2 text-right font-medium text-slate-700">{fmt(Number(r.snapshot?.totalAmount || 0), symbolForCurrency(r.snapshot?.currencyCode || 'INR'), r.snapshot?.currencyCode || 'INR')}</td>
                        <td className="py-2 text-slate-500">{QUOTATION_STATUSES.find(s => s.value === r.snapshot?.status)?.label || r.snapshot?.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // === CREATE VIEW ===
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">{editingId ? `Edit Quotation ${editingQuotationNumber}` : 'Create Quotation'}</h1></div>
        <button onClick={() => { resetCreateState(); setView('list'); }} className="text-sm text-slate-500 hover:text-slate-700">← Back to List</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Client Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Client Information</h2>
            {editingId ? (
              <p className="text-xs text-slate-400 mb-3">Client details are tied to the lead and cannot be changed from here.</p>
            ) : (
              <div className="flex gap-2 mb-4">
                <button onClick={() => { setClientMode('existing'); setClientName(''); setCompanyName(''); setClientEmail(''); setClientPhone(''); setNewClientProjectName(''); setProjectId(''); setProjectName(''); setProductId(''); setNewClientProductName(''); }} className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${clientMode === 'existing' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>Existing Client</button>
                <button onClick={() => { setClientMode('new'); setSelectedLeadId(''); setClientName(''); setCompanyName(''); setClientEmail(''); setClientPhone(''); setNewClientProjectName(''); setProjectId(''); setProjectName(''); setProductId(''); setNewClientProductName(''); }} className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${clientMode === 'new' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>New Client</button>
              </div>
            )}
            {!editingId && clientMode === 'existing' ? (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                  <select value={selectedLeadId} onChange={e => selectExistingLead(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.client ? 'border-red-400' : 'border-slate-300'}`}>
                    <option value="">Select a client</option>
                    {existingLeads.map(l => <option key={l.id} value={l.id}>{l.companyName}</option>)}
                  </select>
                  {formErrors.client && <p className="text-xs text-red-600 mt-1">{formErrors.client}</p>}
                  {existingLeads.length === 0 && <p className="text-xs text-slate-400 mt-1">No existing clients yet — switch to &ldquo;New Client&rdquo; to add one.</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                  <select
                    value={projectId}
                    onChange={e => setProjectId(e.target.value)}
                    disabled={!selectedLeadId || projectsLoading || leadProjects.length === 0 || !!productId}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">
                      {!selectedLeadId ? 'Select a client first' : projectsLoading ? 'Loading projects...' : leadProjects.length === 0 ? 'No projects available' : 'Select Project'}
                    </option>
                    {leadProjects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                  <select
                    value={productId}
                    onChange={e => setProductId(e.target.value)}
                    disabled={!selectedLeadId || productsLoading || leadProducts.length === 0 || !!projectId}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">
                      {!selectedLeadId ? 'Select a client first' : productsLoading ? 'Loading products...' : leadProducts.length === 0 ? 'No products available' : 'Select Product'}
                    </option>
                    {leadProducts.map(p => <option key={p.id} value={p.id}>{p.productName}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Name *</label><input disabled={!!editingId} value={clientName} onChange={e => setClientName(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500 ${formErrors.clientName ? 'border-red-400' : 'border-slate-300'}`} />{formErrors.clientName && <p className="text-xs text-red-600 mt-1">{formErrors.clientName}</p>}</div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Company *</label><input disabled={!!editingId} value={companyName} onChange={e => setCompanyName(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500 ${formErrors.companyName ? 'border-red-400' : 'border-slate-300'}`} />{formErrors.companyName && <p className="text-xs text-red-600 mt-1">{formErrors.companyName}</p>}</div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input disabled={!!editingId} type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input disabled={!!editingId} value={clientPhone} onChange={e => setClientPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500" /></div>
                {editingId ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                      <select
                        value={projectId}
                        onChange={e => setProjectId(e.target.value)}
                        disabled={projectsLoading || leadProjects.length === 0 || !!productId}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="">{projectsLoading ? 'Loading projects...' : leadProjects.length === 0 ? 'No projects available' : 'Select Project'}</option>
                        {leadProjects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                      <select
                        value={productId}
                        onChange={e => setProductId(e.target.value)}
                        disabled={productsLoading || leadProducts.length === 0 || !!projectId}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="">{productsLoading ? 'Loading products...' : leadProducts.length === 0 ? 'No products available' : 'Select Product'}</option>
                        {leadProducts.map(p => <option key={p.id} value={p.id}>{p.productName}</option>)}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label><input value={newClientProjectName} onChange={e => setNewClientProjectName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label><input value={newClientProductName} onChange={e => setNewClientProductName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" /></div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Module Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2"><BuildingOfficeIcon className="h-5 w-5 text-amber-600" /> Select Business Modules *</h2>
            {formErrors.modules && <p className="text-xs text-red-600 mb-2">{formErrors.modules}</p>}
            {(selectedModules.length > 0 || customModules.length > 0) && (
              <div className="flex flex-wrap gap-2 mb-4">{selectedModules.map(code => { const mod = modules.find(m => m.moduleCode === code); return (<span key={code} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${MODULE_COLORS[code] || 'bg-slate-100'}`}>{mod?.moduleName || code}<button onClick={() => toggleModule(code)}><XMarkIcon className="h-3.5 w-3.5" /></button></span>); })}
                {customModules.filter(c => c.name).map(c => <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-700">{c.name}<button onClick={() => removeCustomModule(c.id)}><XMarkIcon className="h-3.5 w-3.5" /></button></span>)}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {modules.map(mod => (
                <button key={mod.moduleCode} onClick={() => toggleModule(mod.moduleCode)} className={`w-full flex items-center justify-between gap-4 p-3 rounded-lg border-2 text-left transition-all ${selectedModules.includes(mod.moduleCode) ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 hover:border-amber-300'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    {selectedModules.includes(mod.moduleCode) && <CheckCircleIcon className="h-5 w-5 text-amber-600 flex-shrink-0" />}
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 truncate">{mod.moduleName}</h3>
                      <p className="text-xs text-slate-500 truncate">{mod.description}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-amber-700 flex-shrink-0 whitespace-nowrap">
                    {pricing
                      ? fmt(pricing.modules.find(m => m.moduleCode === mod.moduleCode)?.basePrice ?? catalogPriceInPricingCurrency(mod.baseLicenseCost, pricing), pricing.currencySymbol, pricing.currencyCode)
                      : fmt(mod.baseLicenseCost, '₹', 'INR')}
                  </p>
                </button>
              ))}
              <button onClick={addCustomModule} className="w-full flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300 text-left hover:border-amber-400 hover:bg-amber-50">
                <PlusIcon className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-800">Others (Custom)</h3>
                  <p className="text-xs text-slate-500 truncate">Add custom module with your own pricing</p>
                </div>
              </button>
            </div>
            {selectedModules.length > 0 && pricing && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-slate-500 uppercase">Module amount (editable)</p>
                {selectedModules.map(code => {
                  const mod = modules.find(m => m.moduleCode === code);
                  const calcPrice = pricing.modules.find(m => m.moduleCode === code)?.basePrice ?? 0;
                  return (
                    <div key={code} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                      <span className="text-sm font-medium text-slate-700">{mod?.moduleName || code}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">{pricing.currencySymbol}</span>
                        <input
                          type="number"
                          value={moduleOverrides[code] ?? calcPrice}
                          onChange={e => updateModuleOverride(code, Number(e.target.value))}
                          className="w-28 px-2 py-1 border border-slate-300 rounded text-sm text-right text-slate-800"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {customModules.length > 0 && (
              <div className="mt-4 space-y-3">{customModules.map(cm => (
                <div key={cm.id} className="p-4 rounded-lg border border-orange-200 bg-orange-50 space-y-3">
                  <div className="flex justify-between"><span className="text-xs font-medium text-orange-700">Custom Module</span><button onClick={() => removeCustomModule(cm.id)} className="text-red-400 hover:text-red-600"><XMarkIcon className="h-4 w-4" /></button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-medium text-slate-600">Name *</label><input value={cm.name} onChange={e => updateCustomModule(cm.id, 'name', e.target.value)} placeholder="AI Integration" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 mt-1" /></div>
                    <div className="flex gap-2"><div className="flex-1"><label className="text-xs font-medium text-slate-600">Cost ({pricing?.currencySymbol || '₹'}) *</label><input type="number" value={cm.cost} onChange={e => updateCustomModule(cm.id, 'cost', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 mt-1" /></div><div className="w-16"><label className="text-xs font-medium text-slate-600">Qty</label><input type="number" min={1} value={cm.quantity} onChange={e => updateCustomModule(cm.id, 'quantity', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 mt-1" /></div></div>
                  </div>
                  <div><label className="text-xs font-medium text-slate-600">Description *</label><textarea rows={2} value={cm.description} onChange={e => updateCustomModule(cm.id, 'description', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 mt-1" /></div>
                </div>
              ))}<button onClick={addCustomModule} className="w-full py-2 border border-dashed border-orange-300 rounded-lg text-sm text-orange-600 hover:bg-orange-50">+ Add Another</button></div>
            )}
          </div>

          {/* Payment Milestones — same UI/fields/validation/calculation as
              QuotationCalculatorForm.tsx's own "Payment Milestones" card, so
              a quotation created from this form (Product Master's own flow
              included) supports the identical milestone → invoice-generation
              behavior. Split the same way: an editable {percentage, gapDays}
              plan before approval, the real materialized (dated, invoiced)
              rows once APPROVED — see openEdit's own comment for where each
              comes from. */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">Payment Milestones</h2>
            {editingStatus === 'APPROVED' && existingMilestones.length > 0 ? (
              <div className="space-y-2">
                {existingMilestones.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 py-2 border-b border-dashed border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Milestone {m.sequence} — {Number(m.percentage)}% ({fmt(Number(m.amount), pricing?.currencySymbol || '₹', pricing?.currencyCode || 'INR')})
                      </p>
                      {m.invoice && (
                        <p className="text-xs text-slate-400">
                          <Link href={`/dashboard/accounting/invoices/${m.invoice.id}`} className="text-amber-700 hover:underline">{m.invoice.invoiceNumber}</Link> — {m.invoice.status}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
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
            ) : editingStatus === 'APPROVED' ? (
              <p className="text-xs text-slate-400">No payment milestones were configured — the full amount was invoiced on approval.</p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-3">Optional — split the quoted amount into staged invoices instead of one lump sum on approval. Leave empty to invoice the full amount once approved.</p>
                <div className="space-y-2">
                  {milestones.map((m, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">Milestone {idx + 1} — % of total</label>
                        <input type="number" min="0" step="0.01" value={m.percentage} onChange={(e) => updateMilestone(idx, 'percentage', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" placeholder="e.g. 50" />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-500 mb-0.5">{idx === 0 ? 'Invoiced on approval' : 'Days after previous milestone'}</label>
                        <input type="number" min="0" value={idx === 0 ? '0' : m.gapDays} disabled={idx === 0} onChange={(e) => updateMilestone(idx, 'gapDays', e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400" placeholder="e.g. 15" />
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

          {/* Client Location */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2"><GlobeAltIcon className="h-5 w-5 text-amber-600" /> Client Location *</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                <CountrySelect
                  value={countryList.find(c => c.isoCode === clientCountry)?.id ?? null}
                  onChange={(c) => { setClientCountry(c.isoCode); setClientState(''); }}
                  disabled={countryLocked}
                />
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><select value={clientState} onChange={e => setClientState(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"><option value="">Select</option>{states.map(s => <option key={s.stateCode} value={s.stateCode}>{s.stateName}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Discount %</label><input type="number" min={0} max={50} value={discountPercentage} onChange={e => setDiscountPercentage(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Tax (GST)</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setTaxInclusive(false)} className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${!taxInclusive ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>Exclusive (add GST on top)</button>
                <button type="button" onClick={() => setTaxInclusive(true)} className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${taxInclusive ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>Inclusive (GST already included)</button>
              </div>
            </div>
          </div>

          {/* Add-ons */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Optional Add-ons</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {addons.map(addon => (
                <button key={addon.addonCode} onClick={() => toggleAddon(addon.addonCode)} className={`p-3 rounded-lg border text-left text-xs transition-all ${selectedAddons.includes(addon.addonCode) ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-between"><span className="font-medium text-slate-700">{addon.addonName}</span>{selectedAddons.includes(addon.addonCode) && <CheckCircleIcon className="h-3.5 w-3.5 text-amber-600" />}</div>
                  <p className="text-amber-700 font-semibold mt-1">
                    {pricing
                      ? fmt(pricing.addons.find(a => a.addonCode === addon.addonCode)?.price ?? catalogPriceInPricingCurrency(addon.price, pricing), pricing.currencySymbol, pricing.currencyCode)
                      : fmt(addon.price, '₹', 'INR')}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Terms & Conditions */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Terms &amp; Conditions</h2>
            {standardTermsText && (
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-500 mb-1">Standard Template (from Settings — applies to every quotation)</p>
                <div className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">{standardTermsText}</div>
              </div>
            )}
            <label className="block text-sm font-medium text-slate-700 mb-1">Additional Clauses (specific to this quotation)</label>
            <textarea
              value={additionalTerms}
              onChange={e => setAdditionalTerms(e.target.value)}
              rows={4}
              placeholder="Any extra terms or clauses that apply only to this quotation"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Right: Pricing Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2"><CurrencyDollarIcon className="h-5 w-5 text-amber-600" /> Pricing Summary</h2>
            {!selectedModules.length && !customModules.length ? (
              <div className="text-center py-8 text-slate-400"><CalculatorIcon className="h-10 w-10 mx-auto mb-3 text-slate-300" /><p className="text-sm">Select a module</p></div>
            ) : pricing ? (
              <div className="space-y-3">
                <div className="flex justify-between text-sm"><span className="text-slate-600">Currency:</span><span className="font-semibold">{pricing.currencySymbol} {pricing.currencyCode}</span></div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500 uppercase">Modules</p>
                  {pricing.modules.map(m => <div key={m.moduleCode} className="flex justify-between text-sm"><span className="text-slate-600">{m.moduleName}</span><span>{fmt(m.basePrice, pricing.currencySymbol, pricing.currencyCode)}</span></div>)}
                  {customModules.filter(c => c.name && c.cost > 0).map(c => <div key={c.id} className="flex justify-between text-sm"><span className="text-orange-700">{c.name}</span><span>{fmt(c.cost * c.quantity, pricing.currencySymbol, pricing.currencyCode)}</span></div>)}
                  <div className="flex justify-between text-sm font-medium border-t pt-1"><span>Modules Total</span><span>{fmt(pricing.modulesSubtotal + customModulesTotal, pricing.currencySymbol, pricing.currencyCode)}</span></div>
                </div>
                <div className="space-y-1.5 text-sm">
                  <p className="text-xs font-medium text-slate-500 uppercase">Service costs (editable)</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Implementation</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">{pricing.currencySymbol}</span>
                      <input type="number" value={serviceOverrides.implementationCost ?? pricing.implementationCost} onChange={e => updateServiceOverride('implementationCost', Number(e.target.value))} className="w-24 px-2 py-1 border border-slate-300 rounded text-sm text-right text-slate-800" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Training</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">{pricing.currencySymbol}</span>
                      <input type="number" value={serviceOverrides.trainingCost ?? pricing.trainingCost} onChange={e => updateServiceOverride('trainingCost', Number(e.target.value))} className="w-24 px-2 py-1 border border-slate-300 rounded text-sm text-right text-slate-800" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600">Annual Maintenance (AMC)</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-500">{pricing.currencySymbol}</span>
                      <input type="number" value={serviceOverrides.annualMaintenanceCost ?? pricing.annualMaintenanceCost} onChange={e => updateServiceOverride('annualMaintenanceCost', Number(e.target.value))} className="w-24 px-2 py-1 border border-slate-300 rounded text-sm text-right text-slate-800" />
                    </div>
                  </div>
                  {pricing.cloudHostingCost > 0 && <div className="flex justify-between"><span className="text-slate-600">Cloud Hosting</span><span>{fmt(pricing.cloudHostingCost, pricing.currencySymbol, pricing.currencyCode)}</span></div>}
                  {pricing.addonsCost > 0 && <div className="flex justify-between"><span className="text-slate-600">Add-ons</span><span>{fmt(pricing.addonsCost, pricing.currencySymbol, pricing.currencyCode)}</span></div>}
                </div>
                <hr />
                <div className="flex justify-between font-medium text-sm"><span>Subtotal</span><span>{fmt(pricing.subtotal + customModulesTotal, pricing.currencySymbol, pricing.currencyCode)}</span></div>
                {pricing.discountAmount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount ({pricing.discountPercentage}%)</span><span>-{fmt(pricing.discountAmount, pricing.currencySymbol, pricing.currencyCode)}</span></div>}
                {pricing.taxBreakdown.length > 0 && <div className="space-y-1"><p className="text-xs font-medium text-slate-500 uppercase">Taxes {pricing.taxInclusive ? '(included in subtotal)' : ''}</p>{pricing.taxBreakdown.map((t, i) => <div key={i} className="flex justify-between text-sm text-slate-600"><span>{t.taxName} ({t.rate}%)</span><span>{fmt(t.amount, pricing.currencySymbol, pricing.currencyCode)}</span></div>)}</div>}
                <hr />
                <div className="flex justify-between items-center pt-1"><span className="text-lg font-bold text-slate-800">Grand Total</span><span className="text-xl font-bold text-amber-700">{fmt(pricing.grandTotal + customModulesTotal, pricing.currencySymbol, pricing.currencyCode)}</span></div>
                <div className="flex gap-2 mt-4">
                  <button onClick={saveQuotation} className="flex-1 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">{editingId ? 'Save Changes' : 'Save Quotation'}</button>
                  {canExport && (
                    <button onClick={downloadPDF} className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50" title="Download"><ArrowDownTrayIcon className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-amber-500 mx-auto" /><p className="text-sm text-slate-400 mt-2">Calculating...</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
