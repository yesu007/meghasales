'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import CountrySelect, { type Country } from '@/components/CountrySelect';
import { usePermissions } from '@/hooks/usePermissions';

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
  const { data: countries = [], isLoading, isError: isCountriesError } = useQuery<CountryRow[]>({
    queryKey: ['countries', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/countries?activeOnly=false');
      if (!res.ok) throw new Error('Failed to load countries');
      return res.json();
    },
  });
  const { data: currencies = [], isError: isCurrenciesError } = useQuery<CurrencyOption[]>({
    queryKey: ['currencies', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/currencies?activeOnly=false');
      if (!res.ok) throw new Error('Failed to load currencies');
      return res.json();
    },
  });

  useEffect(() => {
    if (isCountriesError) toast.error('Failed to load countries');
  }, [isCountriesError]);

  useEffect(() => {
    if (isCurrenciesError) toast.error('Failed to load currencies');
  }, [isCurrenciesError]);

  const blankCountryForm = { countryName: '', isoCode: '', currencyCode: '', defaultTaxType: 'GST', defaultTaxPercentage: 0, flagEmoji: '' };
  const [countryForm, setCountryForm] = useState(blankCountryForm);
  const [editingCountryId, setEditingCountryId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [countryFormErrors, setCountryFormErrors] = useState<Record<string, string>>({});

  const validateCountryForm = (data: typeof countryForm) => {
    const errs: Record<string, string> = {};
    if (!data.countryName) errs.countryName = 'Country name is required';
    if (!data.isoCode) errs.isoCode = 'ISO code is required';
    if (!data.currencyCode) errs.currencyCode = 'Currency is required';
    return errs;
  };

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
      setShowForm(false); setEditingCountryId(null); setCountryForm(blankCountryForm); setCountryFormErrors({});
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
    setCountryFormErrors({});
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Manage Countries</h3>
        <button type="button" onClick={() => { setCountryForm(blankCountryForm); setEditingCountryId(null); setCountryFormErrors({}); setShowForm(s => !s); }} className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700">
          {showForm ? 'Cancel' : '+ Add Country'}
        </button>
      </div>

      {showForm && (
        <div className="grid grid-cols-2 gap-3 p-4 border border-slate-200 rounded-lg bg-slate-50">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Country Name</label>
            <input value={countryForm.countryName} onChange={(e) => setCountryForm(f => ({ ...f, countryName: e.target.value }))} className={`w-full px-3 py-2 border rounded-lg text-sm ${countryFormErrors.countryName ? 'border-red-400' : 'border-slate-300'}`} />
            {countryFormErrors.countryName && <p className="text-xs text-red-600 mt-1">{countryFormErrors.countryName}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ISO Code</label>
            <input value={countryForm.isoCode} onChange={(e) => setCountryForm(f => ({ ...f, isoCode: e.target.value.toUpperCase() }))} maxLength={2} className={`w-full px-3 py-2 border rounded-lg text-sm ${countryFormErrors.isoCode ? 'border-red-400' : 'border-slate-300'}`} />
            {countryFormErrors.isoCode && <p className="text-xs text-red-600 mt-1">{countryFormErrors.isoCode}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Currency</label>
            <select value={countryForm.currencyCode} onChange={(e) => setCountryForm(f => ({ ...f, currencyCode: e.target.value }))} className={`w-full px-3 py-2 border rounded-lg text-sm ${countryFormErrors.currencyCode ? 'border-red-400' : 'border-slate-300'}`}>
              <option value="">Select</option>
              {currencies.map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode} — {c.currencyName}</option>)}
            </select>
            {countryFormErrors.currencyCode && <p className="text-xs text-red-600 mt-1">{countryFormErrors.currencyCode}</p>}
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
            <button
              type="button"
              onClick={() => {
                const errs = validateCountryForm(countryForm);
                setCountryFormErrors(errs);
                if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                saveCountryMutation.mutate(countryForm);
              }}
              disabled={saveCountryMutation.isPending}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
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

interface EmailConfigData {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPasswordSet: boolean;
  fromEmail: string | null;
  fromName: string | null;
  isActive: boolean;
}

const blankEmailForm = { smtpHost: 'smtp.zoho.com', smtpPort: 465, smtpSecure: true, smtpUser: '', smtpPassword: '', fromEmail: '', fromName: 'MeghaSales', isActive: false };

// Separate from the company-profile form above — different backing model
// (EmailConfig), different save action, so it gets its own query/mutation
// rather than being folded into the single "Save Changes" button at the
// bottom of the page.
function EmailSettingsManager() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blankEmailForm);
  const [testTo, setTestTo] = useState('');

  const { data: config, isLoading, isError } = useQuery<EmailConfigData>({
    queryKey: ['email-config'],
    queryFn: async () => {
      const res = await fetch('/api/settings/email-config');
      if (!res.ok) throw new Error('Failed to fetch email settings');
      return res.json();
    },
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load email settings');
  }, [isError]);

  useEffect(() => {
    if (config) {
      setForm({
        smtpHost: config.smtpHost || 'smtp.zoho.com',
        smtpPort: config.smtpPort ?? 465,
        smtpSecure: config.smtpSecure,
        smtpUser: config.smtpUser || '',
        smtpPassword: '',
        fromEmail: config.fromEmail || '',
        fromName: config.fromName || 'MeghaSales',
        isActive: config.isActive,
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch('/api/settings/email-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save email settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-config'] });
      toast.success('Email settings saved!');
    },
    onError: () => toast.error('Failed to save email settings'),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      // Sends whatever is currently in the form, not only what's already
      // saved — otherwise "Send Test Email" silently tests stale saved
      // credentials if clicked before "Save Email Settings".
      const res = await fetch('/api/settings/email-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...(testTo ? { to: testTo } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send test email');
      return data;
    },
    onSuccess: (data) => toast.success(`Test email sent to ${data.to}`),
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading email settings...</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Email (Zoho Mail)</h2>
      <p className="text-sm text-slate-500 mb-4">
        SMTP credentials used to send deadline-reminder emails (events, follow-ups, and action-item deadlines within 24 hours of their due date).
        In-app notifications always fire regardless of this configuration — email is an additional escalation channel.
      </p>

      <div className="flex items-center gap-2 mb-2">
        <input
          type="checkbox"
          id="email-active"
          checked={form.isActive}
          onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        />
        <label htmlFor="email-active" className="text-sm font-medium text-slate-700">Enable email sending</label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Host</label>
          <input value={form.smtpHost} onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">SMTP Port</label>
          <input type="number" value={form.smtpPort} onChange={(e) => setForm((f) => ({ ...f, smtpPort: parseInt(e.target.value, 10) || 0 }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Zoho Mail Address</label>
          <input type="email" value={form.smtpUser} onChange={(e) => setForm((f) => ({ ...f, smtpUser: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" placeholder="notifications@yourcompany.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Zoho App Password {config?.smtpPasswordSet && <span className="text-xs font-normal text-green-600">(set — leave blank to keep)</span>}
          </label>
          <input type="password" value={form.smtpPassword} onChange={(e) => setForm((f) => ({ ...f, smtpPassword: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" placeholder={config?.smtpPasswordSet ? '••••••••' : 'Generate in Zoho Mail → App Passwords'} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">From Email</label>
          <input type="email" value={form.fromEmail} onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">From Name</label>
          <input value={form.fromName} onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Email Settings'}
        </button>
      </div>

      <div className="pt-4 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-500 uppercase mb-2">Test</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="Send to (defaults to your own email)"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {testMutation.isPending ? 'Sending...' : 'Send Test Email'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface NotificationTemplateRow {
  id: number;
  eventType: string;
  channel: 'IN_APP' | 'EMAIL';
  subject: string | null;
  body: string;
  isActive: boolean;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  ACTION_ITEM_DUE_SOON: 'Action Item Due Soon',
  ACTION_ITEM_OVERDUE: 'Action Item Overdue',
  ACTION_ITEM_ESCALATED: 'Action Item Escalated',
  MOM_PUBLISHED: 'MOM Published',
  MEETING_CANCELLED: 'Meeting Cancelled',
  MEETING_RESCHEDULED: 'Meeting Rescheduled',
};

// List + inline-edit, same pattern as accounting's ReminderTemplate
// TemplatesTab — a fixed, pre-seeded set of (eventType, channel) rows
// (no create/delete), so admins only ever edit subject/body/active here.
function NotificationTemplatesManager() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ subject: '', body: '', isActive: true });

  const { data: templates = [], isLoading, isError } = useQuery<NotificationTemplateRow[]>({
    queryKey: ['notification-templates'],
    queryFn: async () => {
      const res = await fetch('/api/settings/notification-templates');
      if (!res.ok) throw new Error('Failed to fetch notification templates');
      return res.json();
    },
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load notification templates');
  }, [isError]);

  const saveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/settings/notification-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error('Failed to save template');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast.success('Template saved');
      setEditingId(null);
    },
    onError: () => toast.error('Failed to save template'),
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading notification templates...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Notification Templates</h2>
        <p className="text-sm text-slate-500">
          Copy sent for SLA reminders/escalations on action items, and for MOM-published/meeting-cancelled/meeting-rescheduled notifications.
          Use <code className="text-xs bg-slate-100 px-1 rounded">{'{{token}}'}</code> placeholders — unmatched tokens render blank.
        </p>
      </div>

      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{EVENT_TYPE_LABELS[t.eventType] || t.eventType}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {t.channel} {!t.isActive && <span className="text-red-500">· inactive</span>}
                </p>
              </div>
              {editingId !== t.id && (
                <button
                  onClick={() => { setEditingId(t.id); setDraft({ subject: t.subject || '', body: t.body, isActive: t.isActive }); }}
                  className="px-2 py-1 text-xs font-medium text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded"
                >
                  Edit
                </button>
              )}
            </div>
            {editingId === t.id ? (
              <div className="mt-3 space-y-2">
                {t.channel === 'EMAIL' && (
                  <input
                    value={draft.subject}
                    onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                    placeholder="Subject"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                  />
                )}
                <textarea
                  rows={3}
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`template-active-${t.id}`}
                    checked={draft.isActive}
                    onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor={`template-active-${t.id}`} className="text-sm text-slate-700">Active</label>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
                  <button onClick={() => saveMutation.mutate(t.id)} disabled={saveMutation.isPending} className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg disabled:opacity-50">
                    {saveMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {t.subject && <p className="text-sm text-slate-600 mt-2 font-medium">{t.subject}</p>}
                <p className="text-sm text-slate-500 mt-1">{t.body}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user?.roles || []).includes('ADMIN');
  const { has: hasPermission } = usePermissions();
  const canManageNotificationTemplates = hasPermission('manage_notification_templates');
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('company');

  const { data: profile, isLoading, isError: isProfileError } = useQuery({
    queryKey: ['company-profile'],
    queryFn: fetchProfile,
  });

  useEffect(() => {
    if (isProfileError) toast.error('Failed to load company profile');
  }, [isProfileError]);

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
    ...(isAdmin ? [{ id: 'regional', label: 'Regional' }, { id: 'email', label: 'Email (Zoho)' }] : []),
    ...(canManageNotificationTemplates ? [{ id: 'notifications', label: 'Notification Templates' }] : []),
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

          {activeTab === 'email' && isAdmin && <EmailSettingsManager />}

          {activeTab === 'notifications' && canManageNotificationTemplates && <NotificationTemplatesManager />}
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
