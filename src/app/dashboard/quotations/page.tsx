'use client';

import { useState, useEffect } from 'react';
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
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { generateInvoicePDF } from '@/lib/generateInvoicePDF';
import { formatCurrency } from '@/lib/currency';
import CountrySelect, { type Country } from '@/components/CountrySelect';
import dayjs from 'dayjs';

const QUOTATION_STATUSES = [
  { value: 'DRAFT', label: 'Draft', color: 'bg-slate-100 text-slate-700' },
  { value: 'SENT', label: 'Sent', color: 'bg-blue-100 text-blue-700' },
  { value: 'APPROVED', label: 'Approved', color: 'bg-green-100 text-green-700' },
  { value: 'REJECTED', label: 'Rejected', color: 'bg-red-100 text-red-700' },
];

const MODULE_COLORS: Record<string, string> = {
  TRADING: 'bg-blue-100 text-blue-700',
  JEWELLERY: 'bg-amber-100 text-amber-700',
  MANUFACTURING: 'bg-purple-100 text-purple-700',
  ACCOUNTS: 'bg-green-100 text-green-700',
};

interface ModuleConfig { id: number; moduleCode: string; moduleName: string; description: string; baseLicenseCost: number; additionalUserCost: number; additionalBranchCost: number; }
interface ExistingLead { id: number; companyName: string; contactPerson: string; email: string | null; mobile: string | null; country: { isoCode: string; countryName: string; flagEmoji: string | null } | null; state: string | null; }
interface AddonConfig { id: number; addonCode: string; addonName: string; description: string; price: number; }
interface PricingResponse { currencyCode: string; currencySymbol: string; exchangeRate: number; modules: { moduleCode: string; moduleName: string; basePrice: number }[]; modulesSubtotal: number; implementationCost: number; trainingCost: number; cloudHostingCost: number; annualMaintenanceCost: number; supportCharges: number; addonsCost: number; subtotal: number; discountPercentage: number; discountAmount: number; taxInclusive: boolean; taxBreakdown: { taxName: string; rate: number; amount: number }[]; totalTax: number; grandTotal: number; addons: { addonCode: string; addonName: string; price: number }[]; }
interface ServiceOverrides { implementationCost?: number; trainingCost?: number; annualMaintenanceCost?: number; }
interface CustomModule { id: string; name: string; description: string; cost: number; quantity: number; }
interface CurrencyOption { currencyCode: string; currencySymbol: string; }

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
  const queryClient = useQueryClient();
  const router = useRouter();
  const [view, setView] = useState<'list' | 'create'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingQuotationNumber, setEditingQuotationNumber] = useState('');

  // Create state
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [selectedLeadId, setSelectedLeadId] = useState('');
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

  const resetCreateState = () => {
    setEditingId(null); setEditingQuotationNumber('');
    setSelectedModules([]); setModuleOverrides({}); setServiceOverrides({}); setCustomModules([]); setClientName(''); setCompanyName(''); setClientEmail(''); setClientPhone('');
    setClientCountry('IN'); setClientState(''); setDiscountPercentage(0); setTaxInclusive(false); setSelectedAddons([]); setPricing(null);
    setClientMode('existing'); setSelectedLeadId(''); setFormErrors({});
  };

  // Fetch quotations from database
  const { data: quotationsData, isError: isQuotationsError } = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => { const r = await fetch('/api/quotations?size=50'); if (!r.ok) throw new Error('Failed'); return r.json(); },
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
    try {
      const sharedFields = {
        softwareModules: [...selectedModules, ...customModules.filter(c => c.name).map(c => ({ name: c.name, cost: c.cost, quantity: c.quantity }))],
        businessModule: selectedModules[0] || null,
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
        pricingSnapshot: pricing,
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
      toast.success(editingId ? 'Quotation updated!' : 'Quotation saved!');
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
    setClientCountry(q.clientCountry || 'IN');
    setClientState(q.clientState || '');
    setDiscountPercentage(Number(q.discountPercentage) || 0);
    setTaxInclusive(!!q.taxInclusive);
    setSelectedAddons(Array.isArray(q.addons) ? q.addons : []);
    setEditingId(q.id);
    setEditingQuotationNumber(q.quotationNumber);
    setView('create');
  };

  const deleteQuotation = async (id: number, quotationNumber: string) => {
    if (!window.confirm(`Delete quotation "${quotationNumber}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Failed to delete quotation'); return; }
    queryClient.invalidateQueries({ queryKey: ['quotations'] });
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
    });
  };

  const downloadQuotationPDF = (q: any) => {
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
      taxInclusive: !!q.taxInclusive,
      taxBreakdown: snapshot?.taxBreakdown || [],
      grandTotal: Number(q.totalAmount),
      currencySymbol: symbol,
      currencyCode: q.currencyCode || 'INR',
      fileName: `${q.quotationNumber}_${q.companyName}.pdf`,
    });
  };

  // === LIST VIEW ===
  if (view === 'list') return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Quotations</h1><p className="text-slate-500 mt-1">Manage quotations</p></div>
        <button onClick={() => { resetCreateState(); setView('create'); }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"><PlusIcon className="h-4 w-4" /> New Quotation</button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {quotations.length === 0 ? (
          <div className="text-center py-16"><CalculatorIcon className="h-12 w-12 mx-auto text-slate-300" /><p className="mt-4 text-lg font-medium text-slate-600">No quotations yet</p><p className="text-sm text-slate-400">Create your first quotation</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Quote No</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Client</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Modules</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-700">Amount</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {quotations.map((q: any) => {
                const modulesList = Array.isArray(q.softwareModules) ? q.softwareModules : [];
                const moduleNames = modulesList.map((m: any) => typeof m === 'string' ? m : m.name || m.moduleCode || '');
                return (
                <tr key={q.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{q.quotationNumber}</td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{q.contactPerson}</p><p className="text-xs text-slate-500">{q.companyName}</p></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{moduleNames.slice(0, 3).map((m: string, i: number) => <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${MODULE_COLORS[m] || 'bg-orange-100 text-orange-700'}`}>{m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()}</span>)}{moduleNames.length > 3 && <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">+{moduleNames.length - 3}</span>}</div></td>
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
                      <button onClick={() => downloadQuotationPDF(q)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Download PDF"><ArrowDownTrayIcon className="h-4 w-4" /></button>
                      {q.status === 'APPROVED' && (
                        <button onClick={() => generateInvoice(q)} className="p-1.5 rounded text-slate-400 hover:text-green-600 hover:bg-green-50" title="Generate Invoice"><DocumentPlusIcon className="h-4 w-4" /></button>
                      )}
                      <button onClick={() => openEdit(q.id)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                      <button onClick={() => deleteQuotation(q.id, q.quotationNumber)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>
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
                <button onClick={() => { setClientMode('existing'); setClientName(''); setCompanyName(''); setClientEmail(''); setClientPhone(''); }} className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${clientMode === 'existing' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>Existing Client</button>
                <button onClick={() => { setClientMode('new'); setSelectedLeadId(''); setClientName(''); setCompanyName(''); setClientEmail(''); setClientPhone(''); }} className={`px-4 py-1.5 rounded-lg text-sm font-medium border ${clientMode === 'new' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>New Client</button>
              </div>
            )}
            {!editingId && clientMode === 'existing' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client *</label>
                <select value={selectedLeadId} onChange={e => selectExistingLead(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.client ? 'border-red-400' : 'border-slate-300'}`}>
                  <option value="">Select a client</option>
                  {existingLeads.map(l => <option key={l.id} value={l.id}>{l.companyName} — {l.contactPerson}{l.email ? ` (${l.email})` : ''}</option>)}
                </select>
                {formErrors.client && <p className="text-xs text-red-600 mt-1">{formErrors.client}</p>}
                {existingLeads.length === 0 && <p className="text-xs text-slate-400 mt-1">No existing clients yet — switch to &ldquo;New Client&rdquo; to add one.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Name *</label><input disabled={!!editingId} value={clientName} onChange={e => setClientName(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500 ${formErrors.clientName ? 'border-red-400' : 'border-slate-300'}`} />{formErrors.clientName && <p className="text-xs text-red-600 mt-1">{formErrors.clientName}</p>}</div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Company *</label><input disabled={!!editingId} value={companyName} onChange={e => setCompanyName(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500 ${formErrors.companyName ? 'border-red-400' : 'border-slate-300'}`} />{formErrors.companyName && <p className="text-xs text-red-600 mt-1">{formErrors.companyName}</p>}</div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input disabled={!!editingId} type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500" /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input disabled={!!editingId} value={clientPhone} onChange={e => setClientPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100 disabled:text-slate-500" /></div>
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
                  <button onClick={downloadPDF} className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50" title="Download"><ArrowDownTrayIcon className="h-4 w-4" /></button>
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
