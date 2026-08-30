'use client';

import { Fragment, Dispatch, SetStateAction } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import CountrySelect, { type Country } from '@/components/CountrySelect';

interface VerticalOption { id: number; name: string }
async function fetchVerticalOptions(): Promise<VerticalOption[]> {
  const res = await fetch('/api/verticals');
  if (!res.ok) throw new Error('Failed to fetch verticals');
  return res.json();
}

// Customer-owned create form. Mirrors the UI/UX of
// src/components/leads/LeadFormDrawer.tsx (same layout, field set and
// validation shape) but is a standalone copy with its own constants,
// state type and validation, and posts to /api/customers rather than
// /api/leads, so Customer creation never depends on Lead's own
// component/business logic. There is no separate Customer table — this
// still ends up as a Lead row with status = CONFIRMED (see the module
// note in src/app/dashboard/customers/page.tsx) — but that's the
// storage detail of the /api/customers endpoint, not this form.

export const CUSTOMER_SOURCES = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'TRADE_SHOW', label: 'Trade Show' },
  { value: 'COLD_CALL', label: 'Cold Call' },
  { value: 'SALES_EXECUTIVE', label: 'Sales Executive' },
];

export interface CustomerFormState {
  companyName: string;
  contactPerson: string;
  mobile: string;
  email: string;
  leadSource: string;
  businessVerticals: string;
  countryId: number | null;
  currencyCode: string;
  currencySymbol: string;
  taxType: string;
  state: string;
  city: string;
  notes: string;
  // Legal Entity for the selected country, under the Customer Company
  // Master (find-or-created by companyName — see /api/customers). A second
  // customer for the same company with a different country selected adds a
  // second entity under the same company, rather than a disconnected one.
  legalName: string;
  taxRegistrationNumber: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
}

export const blankCustomerForm: CustomerFormState = {
  companyName: '', contactPerson: '', mobile: '', email: '', leadSource: '', businessVerticals: '',
  countryId: null, currencyCode: '', currencySymbol: '', taxType: '',
  state: '', city: '', notes: '',
  legalName: '', taxRegistrationNumber: '', addressLine1: '', addressLine2: '', postalCode: '',
};

export interface CustomerCurrencyOption {
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
}

export function validateCustomerForm(data: CustomerFormState): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.companyName) errs.companyName = 'Company name is required';
  if (!data.contactPerson) errs.contactPerson = 'Contact person is required';
  if (!data.mobile) errs.mobile = 'Mobile is required';
  if (!data.leadSource) errs.leadSource = 'Source is required';
  if (!data.countryId) errs.countryId = 'Country is required';
  return errs;
}

export interface CustomerFormDrawerProps {
  open: boolean;
  onClose: () => void;
  form: CustomerFormState;
  setForm: Dispatch<SetStateAction<CustomerFormState>>;
  formErrors: Record<string, string>;
  setFormErrors: Dispatch<SetStateAction<Record<string, string>>>;
  onSave: (data: CustomerFormState) => void;
  isSaving: boolean;
  isAdmin: boolean;
  currencies: CustomerCurrencyOption[];
}

export default function CustomerFormDrawer({
  open, onClose, form, setForm, formErrors, setFormErrors, onSave, isSaving, isAdmin, currencies,
}: CustomerFormDrawerProps) {
  const { data: verticalOptions = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticalOptions });

  const handleCountryChange = (country: Country) => {
    setForm((f) => ({
      ...f,
      countryId: country.id,
      currencyCode: country.currencyCode,
      currencySymbol: country.currencySymbol,
      taxType: country.defaultTaxType,
    }));
  };

  const handleClose = () => { setFormErrors({}); onClose(); };

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="fixed inset-0 bg-black/40" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-hidden">
          <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
            <Transition.Child as={Fragment} enter="transform transition ease-in-out duration-300" enterFrom="translate-x-full" enterTo="translate-x-0" leave="transform transition ease-in-out duration-200" leaveFrom="translate-x-0" leaveTo="translate-x-full">
              <Dialog.Panel className="w-screen max-w-lg">
                <div className="flex h-full flex-col bg-white shadow-xl overflow-y-auto">
                  <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
                    <Dialog.Title className="text-lg font-semibold text-slate-800">Create New Customer</Dialog.Title>
                    <button onClick={handleClose} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const errs = validateCustomerForm(form);
                    setFormErrors(errs);
                    if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                    onSave(form);
                  }} className="flex-1 px-4 sm:px-6 py-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                        <input value={form.companyName} onChange={(e) => setForm(f => ({...f, companyName: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.companyName ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.companyName && <p className="text-xs text-red-600 mt-1">{formErrors.companyName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person *</label>
                        <input value={form.contactPerson} onChange={(e) => setForm(f => ({...f, contactPerson: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.contactPerson ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.contactPerson && <p className="text-xs text-red-600 mt-1">{formErrors.contactPerson}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Mobile *</label>
                        <input value={form.mobile} onChange={(e) => setForm(f => ({...f, mobile: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.mobile ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.mobile && <p className="text-xs text-red-600 mt-1">{formErrors.mobile}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input type="email" value={form.email} onChange={(e) => setForm(f => ({...f, email: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Source *</label>
                        <select value={form.leadSource} onChange={(e) => setForm(f => ({...f, leadSource: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.leadSource ? 'border-red-400' : 'border-slate-300'}`}>
                          <option value="">Select</option>
                          {CUSTOMER_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        {formErrors.leadSource && <p className="text-xs text-red-600 mt-1">{formErrors.leadSource}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Business Vertical</label>
                        <select value={form.businessVerticals} onChange={(e) => setForm(f => ({...f, businessVerticals: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                          <option value="">Select</option>
                          {verticalOptions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Country *</label>
                        <CountrySelect value={form.countryId} onChange={handleCountryChange} />
                        {formErrors.countryId && <p className="text-xs text-red-600 mt-1">{formErrors.countryId}</p>}
                        {form.currencyCode && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            <span>Currency: <strong>{form.currencyCode} ({form.currencySymbol})</strong></span>
                            <span>Tax: <strong>{form.taxType}</strong></span>
                          </div>
                        )}
                        {isAdmin && form.countryId && (
                          <div className="mt-2">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Override currency (Administrator only)</label>
                            <select
                              value={form.currencyCode}
                              onChange={(e) => {
                                const c = currencies.find((cur) => cur.currencyCode === e.target.value);
                                if (c) setForm(f => ({ ...f, currencyCode: c.currencyCode, currencySymbol: c.currencySymbol }));
                              }}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500"
                            >
                              {currencies.map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode} — {c.currencyName}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">State</label>
                        <input value={form.state} onChange={(e) => setForm(f => ({...f, state: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                        <input value={form.city} onChange={(e) => setForm(f => ({...f, city: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>

                      <div className="col-span-2 pt-3 mt-1 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Legal Entity — {form.countryId ? 'this country' : 'select a country above'}</p>
                        <p className="text-xs text-slate-400 mb-3">
                          One company can have several legal entities, one per country it&apos;s registered in — a second customer for the same
                          company name with a different country adds another entity, instead of a duplicate company.
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Registered Legal Name</label>
                        <input value={form.legalName} onChange={(e) => setForm(f => ({...f, legalName: e.target.value}))} placeholder={form.companyName || 'Defaults to Company Name'} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tax Registration Number</label>
                        <input value={form.taxRegistrationNumber} onChange={(e) => setForm(f => ({...f, taxRegistrationNumber: e.target.value}))} placeholder="GST / VAT / Tax ID" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 1</label>
                        <input value={form.addressLine1} onChange={(e) => setForm(f => ({...f, addressLine1: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                        <input value={form.addressLine2} onChange={(e) => setForm(f => ({...f, addressLine2: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Postal Code</label>
                        <input value={form.postalCode} onChange={(e) => setForm(f => ({...f, postalCode: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="col-span-2 -mt-1">
                        <p className="text-xs text-slate-400">Documents (incorporation certificate, tax certificate, etc.) can be uploaded from the customer&apos;s Company tab after saving.</p>
                      </div>

                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea rows={3} value={form.notes} onChange={(e) => setForm(f => ({...f, notes: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={handleClose} className="px-4 py-2 min-h-[44px] text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={isSaving} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {isSaving ? 'Saving...' : 'Save Customer'}
                      </button>
                    </div>
                  </form>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
