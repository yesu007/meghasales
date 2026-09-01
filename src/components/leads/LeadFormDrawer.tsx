'use client';

import { Fragment, Dispatch, SetStateAction } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import CountrySelect, { type Country } from '@/components/CountrySelect';
import { useLeadSources } from '@/hooks/useLeadSources';

interface VerticalOption { id: number; name: string }
async function fetchVerticalOptions(): Promise<VerticalOption[]> {
  const res = await fetch('/api/verticals');
  if (!res.ok) throw new Error('Failed to fetch verticals');
  return res.json();
}

// Project master picker — replaces the old free-text Project Name input.
// linkedLeadsCount (from GET /api/projects) is how many Lead/Customer rows
// already have this same Project selected here, computed server-side so
// this dropdown never has to (mis)count it itself.
interface ProjectOption { id: number; projectName: string; linkedLeadsCount: number }
async function fetchProjectOptions(): Promise<ProjectOption[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

// Extracted from src/app/dashboard/leads/page.tsx so the Customers page
// (converted leads) can offer the same "Edit" capability without
// duplicating this form/validation/save logic — see docs on the Customer
// module for why converted leads are just Leads with status=CONFIRMED
// rather than a separate entity.

export interface LeadFormState {
  companyName: string;
  projectId: number | null;
  contactPerson: string;
  designation: string;
  mobile: string;
  whatsapp: string;
  email: string;
  leadSource: string;
  businessVerticals: string;
  countryId: number | null;
  currencyCode: string;
  currencySymbol: string;
  taxType: string;
  taxPercentage: number | string;
  state: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  notes: string;
}

export const blankLeadForm: LeadFormState = {
  companyName: '', projectId: null, contactPerson: '', designation: '', mobile: '', whatsapp: '', email: '', leadSource: '', businessVerticals: '',
  countryId: null, currencyCode: '', currencySymbol: '', taxType: '', taxPercentage: 0,
  state: '', city: '', addressLine1: '', addressLine2: '', notes: '',
};

export interface CurrencyOption {
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
}

// Fetches a Lead and shapes it into LeadFormState — shared by every page
// that opens this drawer in edit mode, so the businessVerticals JSON-parse
// quirk (see the Lead model's own field comment) only lives in one place.
export async function fetchLeadForEdit(id: number): Promise<LeadFormState | null> {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) return null;
  const lead = await res.json();
  let businessVerticals = '';
  if (lead.businessVerticals) {
    try { businessVerticals = JSON.parse(lead.businessVerticals); } catch { businessVerticals = lead.businessVerticals; }
  }
  return {
    companyName: lead.companyName || '',
    projectId: lead.projectId ?? null,
    contactPerson: lead.contactPerson || '',
    designation: lead.designation || '',
    mobile: lead.mobile || '',
    whatsapp: lead.whatsapp || '',
    email: lead.email || '',
    leadSource: lead.leadSource || '',
    businessVerticals,
    countryId: lead.countryId || null,
    currencyCode: lead.currencyCode || '',
    currencySymbol: lead.currencySymbol || '',
    taxType: lead.taxType || '',
    taxPercentage: 0,
    state: lead.state || '',
    city: lead.city || '',
    addressLine1: lead.addressLine1 || '',
    addressLine2: lead.addressLine2 || '',
    notes: lead.notes || '',
  };
}

function validateLeadForm(data: LeadFormState): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.companyName) errs.companyName = 'Company name is required';
  if (!data.contactPerson) errs.contactPerson = 'Contact person is required';
  if (!data.mobile) errs.mobile = 'Mobile is required';
  if (!data.leadSource) errs.leadSource = 'Lead source is required';
  if (!data.businessVerticals) errs.businessVerticals = 'Business vertical is required';
  if (!data.countryId) errs.countryId = 'Country is required';
  return errs;
}

export interface LeadFormDrawerProps {
  open: boolean;
  onClose: () => void;
  editingId: number | null;
  form: LeadFormState;
  setForm: Dispatch<SetStateAction<LeadFormState>>;
  formErrors: Record<string, string>;
  setFormErrors: Dispatch<SetStateAction<Record<string, string>>>;
  onSave: (data: LeadFormState) => void;
  isSaving: boolean;
  isAdmin: boolean;
  currencies: CurrencyOption[];
}

export default function LeadFormDrawer({
  open, onClose, editingId, form, setForm, formErrors, setFormErrors, onSave, isSaving, isAdmin, currencies,
}: LeadFormDrawerProps) {
  const { data: verticalOptions = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticalOptions });
  const { data: projectOptions = [] } = useQuery({ queryKey: ['projects-for-lead-link'], queryFn: fetchProjectOptions });
  const sources = useLeadSources();

  const handleCountryChange = (country: Country) => {
    setForm((f) => ({
      ...f,
      countryId: country.id,
      currencyCode: country.currencyCode,
      currencySymbol: country.currencySymbol,
      taxType: country.defaultTaxType,
      taxPercentage: country.defaultTaxPercentage,
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
                    <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Lead' : 'Create New Lead'}</Dialog.Title>
                    <button onClick={handleClose} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const errs = validateLeadForm(form);
                    setFormErrors(errs);
                    if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                    onSave(form);
                  }} className="flex-1 px-4 sm:px-6 py-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                        <input value={form.companyName} onChange={(e) => setForm(f => ({...f, companyName: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.companyName ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.companyName && <p className="text-xs text-red-600 mt-1">{formErrors.companyName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                        <select value={form.projectId ?? ''} onChange={(e) => setForm(f => ({...f, projectId: e.target.value ? Number(e.target.value) : null}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
                          <option value="">Unassigned</option>
                          {projectOptions.map(p => <option key={p.id} value={p.id}>{p.projectName} — {p.linkedLeadsCount} {p.linkedLeadsCount === 1 ? 'Project' : 'Projects'}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person *</label>
                        <input value={form.contactPerson} onChange={(e) => setForm(f => ({...f, contactPerson: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.contactPerson ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.contactPerson && <p className="text-xs text-red-600 mt-1">{formErrors.contactPerson}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                        <input value={form.designation} onChange={(e) => setForm(f => ({...f, designation: e.target.value}))} placeholder="e.g. Purchase Manager" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="col-span-2 pt-1">
                        <p className="text-xs font-semibold text-slate-500 uppercase">Contact Channel</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Mobile *</label>
                        <input
                          value={form.mobile}
                          onChange={(e) => setForm(f => {
                            const mobile = e.target.value;
                            // WhatsApp defaults from Mobile as you type, same as the
                            // BRD's "may default from Contact Number" — but only while
                            // it hasn't diverged (still empty, or still tracking the old
                            // Mobile value). The moment someone edits WhatsApp directly,
                            // it's a deliberate override and Mobile edits stop touching it.
                            const whatsappTracksMobile = f.whatsapp === '' || f.whatsapp === f.mobile;
                            return { ...f, mobile, ...(whatsappTracksMobile && { whatsapp: mobile }) };
                          })}
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.mobile ? 'border-red-400' : 'border-slate-300'}`}
                        />
                        {formErrors.mobile && <p className="text-xs text-red-600 mt-1">{formErrors.mobile}</p>}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-medium text-slate-700">WhatsApp</label>
                          {form.mobile && form.whatsapp !== form.mobile && (
                            <button type="button" onClick={() => setForm(f => ({...f, whatsapp: f.mobile}))} className="text-xs text-amber-600 hover:text-amber-700">Same as Mobile</button>
                          )}
                        </div>
                        <input value={form.whatsapp} onChange={(e) => setForm(f => ({...f, whatsapp: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input type="email" value={form.email} onChange={(e) => setForm(f => ({...f, email: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Lead Source *</label>
                        <select value={form.leadSource} onChange={(e) => setForm(f => ({...f, leadSource: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.leadSource ? 'border-red-400' : 'border-slate-300'}`}>
                          <option value="">Select</option>
                          {sources.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                        {formErrors.leadSource && <p className="text-xs text-red-600 mt-1">{formErrors.leadSource}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Business Vertical *</label>
                        <select value={form.businessVerticals} onChange={(e) => setForm(f => ({...f, businessVerticals: e.target.value}))} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.businessVerticals ? 'border-red-400' : 'border-slate-300'}`}>
                          <option value="">Select</option>
                          {verticalOptions.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                        </select>
                        {formErrors.businessVerticals && <p className="text-xs text-red-600 mt-1">{formErrors.businessVerticals}</p>}
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
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 1</label>
                        <input value={form.addressLine1} onChange={(e) => setForm(f => ({...f, addressLine1: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                        <input value={form.addressLine2} onChange={(e) => setForm(f => ({...f, addressLine2: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea rows={3} value={form.notes} onChange={(e) => setForm(f => ({...f, notes: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={handleClose} className="px-4 py-2 min-h-[44px] text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={isSaving} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Lead'}
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
