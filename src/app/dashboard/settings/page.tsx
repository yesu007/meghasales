'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import CountrySelect, { type Country } from '@/components/CountrySelect';

async function fetchProfile() {
  const res = await fetch('/api/settings/profile');
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

interface CurrencyOption {
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
}

interface CountryRow extends Country {}

function CountryMasterManager() {
  const queryClient = useQueryClient();
  const { data: countries = [], isLoading } = useQuery<CountryRow[]>({
    queryKey: ['countries', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/countries?activeOnly=false');
      if (!res.ok) throw new Error('Failed to load countries');
      return res.json();
    },
  });
  const { data: currencies = [] } = useQuery<CurrencyOption[]>({
    queryKey: ['currencies', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/currencies?activeOnly=false');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const blankCountryForm = { countryName: '', isoCode: '', currencyCode: '', defaultTaxType: 'GST', defaultTaxPercentage: 0, flagEmoji: '' };
  const [countryForm, setCountryForm] = useState(blankCountryForm);
  const [editingCountryId, setEditingCountryId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const saveCountryMutation = useMutation({
    mutationFn: async (data: typeof countryForm) => {
      const url = editingCountryId ? `/api/countries/${editingCountryId}` : '/api/countries';
      const method = editingCountryId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to save country'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['countries'] });
      toast.success(editingCountryId ? 'Country updated' : 'Country added');
      setShowForm(false); setEditingCountryId(null); setCountryForm(blankCountryForm);
    },
    onError: (e: any) => toast.error(e.message || 'Failed to save country'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/countries/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error('Failed to update country');
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['countries'] }); toast.success('Country updated'); },
    onError: () => toast.error('Failed to update country'),
  });

  const openEditCountry = (c: CountryRow) => {
    setCountryForm({ countryName: c.countryName, isoCode: c.isoCode, currencyCode: c.currencyCode, defaultTaxType: c.defaultTaxType, defaultTaxPercentage: Number(c.defaultTaxPercentage), flagEmoji: c.flagEmoji || '' });
    setEditingCountryId(c.id);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Manage Countries</h3>
        <button type="button" onClick={() => { setCountryForm(blankCountryForm); setEditingCountryId(null); setShowForm(s => !s); }} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
          {showForm ? 'Cancel' : '+ Add Country'}
        </button>
      </div>

      {showForm && (
        <div className="grid grid-cols-2 gap-3 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Country Name</label>
            <input value={countryForm.countryName} onChange={(e) => setCountryForm(f => ({ ...f, countryName: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ISO Code</label>
            <input value={countryForm.isoCode} onChange={(e) => setCountryForm(f => ({ ...f, isoCode: e.target.value.toUpperCase() }))} maxLength={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
            <select value={countryForm.currencyCode} onChange={(e) => setCountryForm(f => ({ ...f, currencyCode: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">Select</option>
              {currencies.map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode} — {c.currencyName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Flag Emoji</label>
            <input value={countryForm.flagEmoji} onChange={(e) => setCountryForm(f => ({ ...f, flagEmoji: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tax Type</label>
            <select value={countryForm.defaultTaxType} onChange={(e) => setCountryForm(f => ({ ...f, defaultTaxType: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="GST">GST</option>
              <option value="VAT">VAT</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tax Percentage</label>
            <input type="number" step="0.01" value={countryForm.defaultTaxPercentage} onChange={(e) => setCountryForm(f => ({ ...f, defaultTaxPercentage: parseFloat(e.target.value) || 0 }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div className="col-span-2 flex justify-end">
            <button type="button" onClick={() => saveCountryMutation.mutate(countryForm)} disabled={saveCountryMutation.isPending} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {saveCountryMutation.isPending ? 'Saving...' : editingCountryId ? 'Save Changes' : 'Add Country'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Country</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">ISO</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Currency</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Tax</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700">Status</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">Loading...</td></tr>
            ) : countries.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2">{c.flagEmoji} {c.countryName}</td>
                <td className="px-3 py-2">{c.isoCode}</td>
                <td className="px-3 py-2">{c.currencyCode} ({c.currencySymbol})</td>
                <td className="px-3 py-2">{c.defaultTaxType}{Number(c.defaultTaxPercentage) > 0 ? ` ${c.defaultTaxPercentage}%` : ''}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{c.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button type="button" onClick={() => openEditCountry(c)} className="text-amber-600 hover:text-amber-700 text-xs font-medium">Edit</button>
                  <button type="button" onClick={() => toggleActiveMutation.mutate({ id: c.id, isActive: !c.isActive })} className="text-slate-500 hover:text-slate-700 text-xs font-medium">{c.isActive ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('company');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['company-profile'],
    queryFn: fetchProfile,
  });

  const [form, setForm] = useState({
    companyName: '',
    tagline: '',
    email: '',
    phone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
    gstNumber: '',
    panNumber: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    authorizedSignatory: '',
    signatoryDesignation: '',
    primaryColor: '#1E3A5F',
    secondaryColor: '#D4AF37',
    termsAndConditions: '',
    paymentTerms: '',
    warrantyTerms: '',
    defaultCountryId: null as number | null,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        companyName: profile.companyName || '',
        tagline: profile.tagline || '',
        email: profile.email || '',
        phone: profile.phone || '',
        website: profile.website || '',
        addressLine1: profile.addressLine1 || '',
        addressLine2: profile.addressLine2 || '',
        city: profile.city || '',
        state: profile.state || '',
        country: profile.country || '',
        postalCode: profile.postalCode || '',
        gstNumber: profile.gstNumber || '',
        panNumber: profile.panNumber || '',
        bankName: profile.bankName || '',
        bankAccountNumber: profile.bankAccountNumber || '',
        bankIfsc: profile.bankIfsc || '',
        authorizedSignatory: profile.authorizedSignatory || '',
        signatoryDesignation: profile.signatoryDesignation || '',
        primaryColor: profile.primaryColor || '#1E3A5F',
        secondaryColor: profile.secondaryColor || '#D4AF37',
        termsAndConditions: profile.termsAndConditions || '',
        paymentTerms: profile.paymentTerms || '',
        warrantyTerms: profile.warrantyTerms || '',
        defaultCountryId: profile.defaultCountryId || null,
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      toast.success('Settings saved!');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const tabs = [
    { id: 'company', label: 'Company' },
    { id: 'address', label: 'Address' },
    { id: 'finance', label: 'Finance' },
    { id: 'branding', label: 'Branding' },
    { id: 'terms', label: 'Terms & Policies' },
    ...(isAdmin ? [{ id: 'regional', label: 'Regional' }] : []),
  ];

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" />
        <p className="mt-4 text-sm text-slate-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your company profile and system configuration</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {activeTab === 'company' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Company Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                  <input
                    value={form.companyName}
                    onChange={(e) => setForm(f => ({ ...f, companyName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tagline</label>
                  <input
                    value={form.tagline}
                    onChange={(e) => setForm(f => ({ ...f, tagline: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                  <input
                    value={form.website}
                    onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Authorized Signatory</label>
                  <input
                    value={form.authorizedSignatory}
                    onChange={(e) => setForm(f => ({ ...f, authorizedSignatory: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Signatory Designation</label>
                  <input
                    value={form.signatoryDesignation}
                    onChange={(e) => setForm(f => ({ ...f, signatoryDesignation: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'address' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Address</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 1</label>
                  <input
                    value={form.addressLine1}
                    onChange={(e) => setForm(f => ({ ...f, addressLine1: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                  <input
                    value={form.addressLine2}
                    onChange={(e) => setForm(f => ({ ...f, addressLine2: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                  <input
                    value={form.state}
                    onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Country</label>
                  <input
                    value={form.country}
                    onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Postal Code</label>
                  <input
                    value={form.postalCode}
                    onChange={(e) => setForm(f => ({ ...f, postalCode: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Finance & Tax</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">GST Number</label>
                  <input
                    value={form.gstNumber}
                    onChange={(e) => setForm(f => ({ ...f, gstNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">PAN Number</label>
                  <input
                    value={form.panNumber}
                    onChange={(e) => setForm(f => ({ ...f, panNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="md:col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Bank Details</h3>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bank Name</label>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account Number</label>
                  <input
                    value={form.bankAccountNumber}
                    onChange={(e) => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">IFSC Code</label>
                  <input
                    value={form.bankIfsc}
                    onChange={(e) => setForm(f => ({ ...f, bankIfsc: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'branding' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Branding</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Primary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.primaryColor}
                      onChange={(e) => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                      className="h-10 w-16 border border-slate-300 rounded cursor-pointer"
                    />
                    <input
                      value={form.primaryColor}
                      onChange={(e) => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Secondary Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={form.secondaryColor}
                      onChange={(e) => setForm(f => ({ ...f, secondaryColor: e.target.value }))}
                      className="h-10 w-16 border border-slate-300 rounded cursor-pointer"
                    />
                    <input
                      value={form.secondaryColor}
                      onChange={(e) => setForm(f => ({ ...f, secondaryColor: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
              <div className="mt-4 p-4 rounded-lg border border-slate-200">
                <p className="text-sm text-slate-500 mb-2">Preview</p>
                <div className="flex gap-4">
                  <div className="w-24 h-12 rounded-lg flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: form.primaryColor }}>
                    Primary
                  </div>
                  <div className="w-24 h-12 rounded-lg flex items-center justify-center text-white text-xs font-medium" style={{ backgroundColor: form.secondaryColor }}>
                    Secondary
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Terms & Policies</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Terms & Conditions</label>
                  <textarea
                    rows={5}
                    value={form.termsAndConditions}
                    onChange={(e) => setForm(f => ({ ...f, termsAndConditions: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                    placeholder="Enter terms and conditions for quotations..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Payment Terms</label>
                  <textarea
                    rows={4}
                    value={form.paymentTerms}
                    onChange={(e) => setForm(f => ({ ...f, paymentTerms: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                    placeholder="Enter payment terms..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Warranty Terms</label>
                  <textarea
                    rows={4}
                    value={form.warrantyTerms}
                    onChange={(e) => setForm(f => ({ ...f, warrantyTerms: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                    placeholder="Enter warranty/AMC terms..."
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'regional' && isAdmin && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-4">Regional</h2>
                <div className="max-w-sm">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Default Country</label>
                  <CountrySelect
                    value={form.defaultCountryId}
                    onChange={(c: Country) => setForm(f => ({ ...f, defaultCountryId: c.id }))}
                  />
                  <p className="text-xs text-slate-500 mt-1">Used to default a new lead&apos;s country when none is otherwise implied.</p>
                </div>
              </div>
              <div className="border-t pt-6">
                <CountryMasterManager />
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end mt-6">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="px-6 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
