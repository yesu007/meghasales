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
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';

const COUNTRIES = [
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'AE', name: 'Dubai (UAE)', flag: '🇦🇪' },
  { code: 'TH', name: 'Thailand', flag: '🇹🇭' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'HK', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
];

const MODULE_COLORS: Record<string, string> = {
  TRADING: 'bg-blue-100 text-blue-700',
  JEWELLERY: 'bg-amber-100 text-amber-700',
  MANUFACTURING: 'bg-purple-100 text-purple-700',
  ACCOUNTS: 'bg-green-100 text-green-700',
};

interface ModuleConfig { id: number; moduleCode: string; moduleName: string; description: string; baseLicenseCost: number; additionalUserCost: number; additionalBranchCost: number; }
interface AddonConfig { id: number; addonCode: string; addonName: string; description: string; price: number; }
interface PricingResponse { currencyCode: string; currencySymbol: string; modules: { moduleCode: string; moduleName: string; basePrice: number }[]; modulesSubtotal: number; implementationCost: number; trainingCost: number; cloudHostingCost: number; annualMaintenanceCost: number; supportCharges: number; addonsCost: number; subtotal: number; discountPercentage: number; discountAmount: number; taxBreakdown: { taxName: string; rate: number; amount: number }[]; totalTax: number; grandTotal: number; addons: { addonCode: string; addonName: string; price: number }[]; }
interface CustomModule { id: string; name: string; description: string; cost: number; quantity: number; }

function fmt(amount: number, symbol: string = '₹'): string {
  return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuotationsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'create'>('list');

  // Create state
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [customModules, setCustomModules] = useState<CustomModule[]>([]);
  const [clientCountry, setClientCountry] = useState('IN');
  const [clientState, setClientState] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);

  // Fetch quotations from database
  const { data: quotationsData } = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => { const r = await fetch('/api/quotations?size=50'); if (!r.ok) throw new Error('Failed'); return r.json(); },
  });
  const quotations = quotationsData?.content || [];

  // Fetch modules and addons
  const { data: modules = [] } = useQuery<ModuleConfig[]>({
    queryKey: ['modules'],
    queryFn: async () => { const r = await fetch('/api/quotation-config'); return r.json(); },
  });
  const { data: addons = [] } = useQuery<AddonConfig[]>({
    queryKey: ['addons'],
    queryFn: async () => { const r = await fetch('/api/quotation-config?type=addons'); return r.json(); },
  });
  const { data: states = [] } = useQuery<{ stateCode: string; stateName: string }[]>({
    queryKey: ['states', clientCountry],
    queryFn: async () => { const r = await fetch(`/api/quotation-config/taxes?type=states&country=${clientCountry}`); return r.json(); },
    enabled: !!clientCountry,
  });

  // Auto-calculate pricing
  const calcMutation = useMutation({
    mutationFn: async (data: any) => { const r = await fetch('/api/quotation-config/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.json(); },
    onSuccess: (data) => setPricing(data),
  });

  useEffect(() => {
    if (selectedModules.length > 0 && clientCountry) {
      const t = setTimeout(() => {
        calcMutation.mutate({ moduleCodes: selectedModules, clientCountry, clientState: clientState || undefined, discountPercentage: discountPercentage || undefined, addonCodes: selectedAddons.length > 0 ? selectedAddons : undefined });
      }, 300);
      return () => clearTimeout(t);
    } else { setPricing(null); }
  }, [selectedModules, clientCountry, clientState, discountPercentage, selectedAddons]);

  const toggleModule = (code: string) => setSelectedModules(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  const toggleAddon = (code: string) => setSelectedAddons(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  const addCustomModule = () => setCustomModules(prev => [...prev, { id: Date.now().toString(), name: '', description: '', cost: 0, quantity: 1 }]);
  const removeCustomModule = (id: string) => setCustomModules(prev => prev.filter(m => m.id !== id));
  const updateCustomModule = (id: string, field: keyof CustomModule, value: any) => setCustomModules(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  const customModulesTotal = customModules.reduce((sum, m) => sum + (m.cost * m.quantity), 0);

  const saveQuotation = async () => {
    if (!pricing || !clientName || !companyName || (selectedModules.length === 0 && customModules.filter(c => c.name && c.cost > 0).length === 0)) {
      toast.error('Fill required fields and select at least one module'); return;
    }
    try {
      const res = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          clientName,
          clientEmail,
          clientPhone,
          softwareModules: [...selectedModules, ...customModules.filter(c => c.name).map(c => ({ name: c.name, cost: c.cost, quantity: c.quantity }))],
          businessModule: selectedModules[0] || null,
          clientCountry,
          clientState: clientState || null,
          currencyCode: pricing.currencyCode,
          totalAmount: pricing.grandTotal + customModulesTotal,
          implementationCost: pricing.implementationCost,
          trainingCost: pricing.trainingCost,
          annualMaintenance: pricing.annualMaintenanceCost,
          customDevelopmentCost: customModulesTotal > 0 ? customModulesTotal : null,
          discountPercentage: pricing.discountPercentage || null,
          discountAmount: pricing.discountAmount || null,
          taxAmount: pricing.totalTax || null,
          taxBreakdown: pricing.taxBreakdown,
          addons: selectedAddons,
          pricingSnapshot: pricing,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setSelectedModules([]); setCustomModules([]); setClientName(''); setCompanyName(''); setClientEmail(''); setClientPhone('');
      setDiscountPercentage(0); setSelectedAddons([]); setPricing(null);
      toast.success('Quotation saved!');
      setView('list');
    } catch {
      toast.error('Failed to save quotation');
    }
  };

  const downloadPDF = () => {
    if (!pricing) return;
    const doc = new jsPDF();
    const symbol = pricing.currencySymbol;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 58, 95);
    doc.text('QUOTATION', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Date: ${dayjs().format('DD MMM YYYY')}`, 14, 30);
    doc.text('Tekfilo - MeghaJewels CRM', 140, 22);

    // Client info
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('Bill To:', 14, 44);
    doc.setFontSize(10);
    doc.text(clientName, 14, 51);
    doc.text(companyName, 14, 57);
    if (clientEmail) doc.text(clientEmail, 14, 63);
    if (clientPhone) doc.text(clientPhone, 14, 69);

    // Modules table
    const tableData: any[] = [];
    pricing.modules.forEach(m => { tableData.push([m.moduleName, `${symbol}${m.basePrice.toLocaleString()}`]); });
    customModules.filter(c => c.name && c.cost > 0).forEach(c => { tableData.push([`${c.name} (Custom)`, `${symbol}${(c.cost * c.quantity).toLocaleString()}`]); });

    autoTable(doc, {
      startY: 78,
      head: [['Description', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 95] },
      columnStyles: { 1: { halign: 'right' } },
    });

    let y = (doc as any).lastAutoTable.finalY + 10;

    // Additional costs
    if (pricing.implementationCost > 0) { doc.text(`Implementation: ${symbol}${pricing.implementationCost.toLocaleString()}`, 130, y, { align: 'right' }); y += 6; }
    if (pricing.trainingCost > 0) { doc.text(`Training: ${symbol}${pricing.trainingCost.toLocaleString()}`, 130, y, { align: 'right' }); y += 6; }
    if (pricing.annualMaintenanceCost > 0) { doc.text(`AMC: ${symbol}${pricing.annualMaintenanceCost.toLocaleString()}`, 130, y, { align: 'right' }); y += 6; }

    // Subtotal, Discount, Tax, Grand Total
    y += 4;
    doc.setDrawColor(200);
    doc.line(100, y, 196, y); y += 8;
    doc.text(`Subtotal: ${symbol}${(pricing.subtotal + customModulesTotal).toLocaleString()}`, 196, y, { align: 'right' }); y += 7;
    if (pricing.discountAmount > 0) { doc.setTextColor(0, 128, 0); doc.text(`Discount (${pricing.discountPercentage}%): -${symbol}${pricing.discountAmount.toLocaleString()}`, 196, y, { align: 'right' }); y += 7; doc.setTextColor(0); }
    pricing.taxBreakdown.forEach(t => { doc.text(`${t.taxName} (${t.rate}%): ${symbol}${t.amount.toLocaleString()}`, 196, y, { align: 'right' }); y += 7; });

    y += 4;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${symbol}${(pricing.grandTotal + customModulesTotal).toLocaleString()}`, 196, y, { align: 'right' });

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128);
    doc.text('Generated by Tekfilo CRM', 14, 285);

    doc.save(`Quotation_${companyName || 'Client'}_${dayjs().format('YYYYMMDD')}.pdf`);
    toast.success('PDF Downloaded!');
  };

  const downloadQuotationPDF = (q: any) => {
    const doc = new jsPDF();
    const snapshot = q.pricingSnapshot as any;
    const modulesList = Array.isArray(q.softwareModules) ? q.softwareModules : [];
    const symbol = snapshot?.currencySymbol || '₹';

    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 58, 95);
    doc.text('QUOTATION', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`No: ${q.quotationNumber}`, 14, 30);
    doc.text(`Date: ${dayjs(q.createdAt).format('DD MMM YYYY')}`, 14, 36);
    doc.text(`Status: ${q.status}`, 14, 42);
    doc.text('Tekfilo - MeghaJewels CRM', 140, 22);

    // Client info
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('Bill To:', 14, 54);
    doc.setFontSize(10);
    doc.text(q.contactPerson || '', 14, 61);
    doc.text(q.companyName || '', 14, 67);

    // Modules table
    const tableData: any[] = [];
    if (snapshot?.modules?.length > 0) {
      snapshot.modules.forEach((m: any) => { tableData.push([m.moduleName, `${symbol}${Number(m.basePrice).toLocaleString()}`]); });
    } else {
      modulesList.forEach((m: any) => {
        const name = typeof m === 'string' ? m : m.name || m.moduleCode || '';
        const cost = typeof m === 'object' && m.cost ? `${symbol}${Number(m.cost).toLocaleString()}` : '—';
        tableData.push([name, cost]);
      });
    }

    autoTable(doc, {
      startY: 76,
      head: [['Description', 'Amount']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 95] },
      columnStyles: { 1: { halign: 'right' } },
    });

    let y = (doc as any).lastAutoTable.finalY + 10;

    if (snapshot) {
      if (snapshot.implementationCost > 0) { doc.text(`Implementation: ${symbol}${Number(snapshot.implementationCost).toLocaleString()}`, 196, y, { align: 'right' }); y += 6; }
      if (snapshot.trainingCost > 0) { doc.text(`Training: ${symbol}${Number(snapshot.trainingCost).toLocaleString()}`, 196, y, { align: 'right' }); y += 6; }
      if (snapshot.annualMaintenanceCost > 0) { doc.text(`AMC: ${symbol}${Number(snapshot.annualMaintenanceCost).toLocaleString()}`, 196, y, { align: 'right' }); y += 6; }

      y += 4;
      doc.setDrawColor(200);
      doc.line(100, y, 196, y); y += 8;
      doc.text(`Subtotal: ${symbol}${Number(snapshot.subtotal).toLocaleString()}`, 196, y, { align: 'right' }); y += 7;
      if (snapshot.discountAmount > 0) { doc.setTextColor(0, 128, 0); doc.text(`Discount (${snapshot.discountPercentage}%): -${symbol}${Number(snapshot.discountAmount).toLocaleString()}`, 196, y, { align: 'right' }); y += 7; doc.setTextColor(0); }
      (snapshot.taxBreakdown || []).forEach((t: any) => { doc.text(`${t.taxName} (${t.rate}%): ${symbol}${Number(t.amount).toLocaleString()}`, 196, y, { align: 'right' }); y += 7; });
    }

    y += 4;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(`Grand Total: ${q.currencyCode || '₹'} ${Number(q.totalAmount).toLocaleString()}`, 196, y, { align: 'right' });

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(128);
    doc.text('Generated by Tekfilo CRM', 14, 285);

    doc.save(`${q.quotationNumber}_${q.companyName}.pdf`);
    toast.success('PDF Downloaded!');
  };

  // === LIST VIEW ===
  if (view === 'list') return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-slate-800">Quotations</h1><p className="text-slate-500 mt-1">Manage quotations</p></div>
        <button onClick={() => setView('create')} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"><PlusIcon className="h-4 w-4" /> New Quotation</button>
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
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">{q.currencyCode || '₹'} {Number(q.totalAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${q.status === 'DRAFT' ? 'bg-slate-100 text-slate-700' : q.status === 'SENT' ? 'bg-blue-100 text-blue-700' : q.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{q.status}</span></td>
                  <td className="px-4 py-3 text-slate-500">{dayjs(q.createdAt).format('DD MMM YYYY')}</td>
                  <td className="px-4 py-3"><button onClick={() => downloadQuotationPDF(q)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Download PDF"><ArrowDownTrayIcon className="h-4 w-4" /></button></td>
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
        <div><h1 className="text-2xl font-bold text-slate-800">Create Quotation</h1></div>
        <button onClick={() => setView('list')} className="text-sm text-slate-500 hover:text-slate-700">← Back to List</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Client Info */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Client Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Client Name *</label><input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Company *</label><input value={companyName} onChange={e => setCompanyName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" /></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Phone</label><input value={clientPhone} onChange={e => setClientPhone(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" /></div>
            </div>
          </div>

          {/* Module Selection */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2 flex items-center gap-2"><BuildingOfficeIcon className="h-5 w-5 text-amber-600" /> Select Business Modules *</h2>
            {(selectedModules.length > 0 || customModules.length > 0) && (
              <div className="flex flex-wrap gap-2 mb-4">{selectedModules.map(code => { const mod = modules.find(m => m.moduleCode === code); return (<span key={code} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${MODULE_COLORS[code] || 'bg-slate-100'}`}>{mod?.moduleName || code}<button onClick={() => toggleModule(code)}><XMarkIcon className="h-3.5 w-3.5" /></button></span>); })}
                {customModules.filter(c => c.name).map(c => <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-700">{c.name}<button onClick={() => removeCustomModule(c.id)}><XMarkIcon className="h-3.5 w-3.5" /></button></span>)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {modules.map(mod => (
                <button key={mod.moduleCode} onClick={() => toggleModule(mod.moduleCode)} className={`p-4 rounded-lg border-2 text-left transition-all ${selectedModules.includes(mod.moduleCode) ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 hover:border-amber-300'}`}>
                  <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800">{mod.moduleName}</h3>{selectedModules.includes(mod.moduleCode) && <CheckCircleIcon className="h-5 w-5 text-amber-600" />}</div>
                  <p className="text-xs text-slate-500 mt-1">{mod.description}</p>
                  <p className="text-sm font-bold text-amber-700 mt-2">₹{mod.baseLicenseCost.toLocaleString()}</p>
                </button>
              ))}
              <button onClick={addCustomModule} className="p-4 rounded-lg border-2 border-dashed border-slate-300 text-left hover:border-amber-400 hover:bg-amber-50">
                <div className="flex items-center gap-2"><PlusIcon className="h-5 w-5 text-amber-600" /><h3 className="font-semibold text-slate-800">Others (Custom)</h3></div>
                <p className="text-xs text-slate-500 mt-1">Add custom module with your own pricing</p>
              </button>
            </div>
            {customModules.length > 0 && (
              <div className="mt-4 space-y-3">{customModules.map(cm => (
                <div key={cm.id} className="p-4 rounded-lg border border-orange-200 bg-orange-50 space-y-3">
                  <div className="flex justify-between"><span className="text-xs font-medium text-orange-700">Custom Module</span><button onClick={() => removeCustomModule(cm.id)} className="text-red-400 hover:text-red-600"><XMarkIcon className="h-4 w-4" /></button></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs font-medium text-slate-600">Name *</label><input value={cm.name} onChange={e => updateCustomModule(cm.id, 'name', e.target.value)} placeholder="AI Integration" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 mt-1" /></div>
                    <div className="flex gap-2"><div className="flex-1"><label className="text-xs font-medium text-slate-600">Cost (₹) *</label><input type="number" value={cm.cost} onChange={e => updateCustomModule(cm.id, 'cost', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 mt-1" /></div><div className="w-16"><label className="text-xs font-medium text-slate-600">Qty</label><input type="number" min={1} value={cm.quantity} onChange={e => updateCustomModule(cm.id, 'quantity', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 mt-1" /></div></div>
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
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Country</label><select value={clientCountry} onChange={e => { setClientCountry(e.target.value); setClientState(''); }} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">{COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">State</label><select value={clientState} onChange={e => setClientState(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"><option value="">Select</option>{states.map(s => <option key={s.stateCode} value={s.stateCode}>{s.stateName}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Discount %</label><input type="number" min={0} max={50} value={discountPercentage} onChange={e => setDiscountPercentage(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
            </div>
          </div>

          {/* Add-ons */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Optional Add-ons</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {addons.map(addon => (
                <button key={addon.addonCode} onClick={() => toggleAddon(addon.addonCode)} className={`p-3 rounded-lg border text-left text-xs transition-all ${selectedAddons.includes(addon.addonCode) ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-between"><span className="font-medium text-slate-700">{addon.addonName}</span>{selectedAddons.includes(addon.addonCode) && <CheckCircleIcon className="h-3.5 w-3.5 text-amber-600" />}</div>
                  <p className="text-amber-700 font-semibold mt-1">₹{addon.price.toLocaleString()}</p>
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
                  {pricing.modules.map(m => <div key={m.moduleCode} className="flex justify-between text-sm"><span className="text-slate-600">{m.moduleName}</span><span>{fmt(m.basePrice, pricing.currencySymbol)}</span></div>)}
                  {customModules.filter(c => c.name && c.cost > 0).map(c => <div key={c.id} className="flex justify-between text-sm"><span className="text-orange-700">{c.name}</span><span>{fmt(c.cost * c.quantity, pricing.currencySymbol)}</span></div>)}
                  <div className="flex justify-between text-sm font-medium border-t pt-1"><span>Modules Total</span><span>{fmt(pricing.modulesSubtotal + customModulesTotal, pricing.currencySymbol)}</span></div>
                </div>
                <div className="space-y-1 text-sm">
                  {pricing.implementationCost > 0 && <div className="flex justify-between"><span className="text-slate-600">Implementation</span><span>{fmt(pricing.implementationCost, pricing.currencySymbol)}</span></div>}
                  {pricing.trainingCost > 0 && <div className="flex justify-between"><span className="text-slate-600">Training</span><span>{fmt(pricing.trainingCost, pricing.currencySymbol)}</span></div>}
                  {pricing.cloudHostingCost > 0 && <div className="flex justify-between"><span className="text-slate-600">Cloud Hosting</span><span>{fmt(pricing.cloudHostingCost, pricing.currencySymbol)}</span></div>}
                  {pricing.annualMaintenanceCost > 0 && <div className="flex justify-between"><span className="text-slate-600">AMC</span><span>{fmt(pricing.annualMaintenanceCost, pricing.currencySymbol)}</span></div>}
                  {pricing.addonsCost > 0 && <div className="flex justify-between"><span className="text-slate-600">Add-ons</span><span>{fmt(pricing.addonsCost, pricing.currencySymbol)}</span></div>}
                </div>
                <hr />
                <div className="flex justify-between font-medium text-sm"><span>Subtotal</span><span>{fmt(pricing.subtotal + customModulesTotal, pricing.currencySymbol)}</span></div>
                {pricing.discountAmount > 0 && <div className="flex justify-between text-sm text-green-600"><span>Discount ({pricing.discountPercentage}%)</span><span>-{fmt(pricing.discountAmount, pricing.currencySymbol)}</span></div>}
                {pricing.taxBreakdown.length > 0 && <div className="space-y-1"><p className="text-xs font-medium text-slate-500 uppercase">Taxes</p>{pricing.taxBreakdown.map((t, i) => <div key={i} className="flex justify-between text-sm text-slate-600"><span>{t.taxName} ({t.rate}%)</span><span>{fmt(t.amount, pricing.currencySymbol)}</span></div>)}</div>}
                <hr />
                <div className="flex justify-between items-center pt-1"><span className="text-lg font-bold text-slate-800">Grand Total</span><span className="text-xl font-bold text-amber-700">{fmt(pricing.grandTotal + customModulesTotal, pricing.currencySymbol)}</span></div>
                <div className="flex gap-2 mt-4">
                  <button onClick={saveQuotation} className="flex-1 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">Save Quotation</button>
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
