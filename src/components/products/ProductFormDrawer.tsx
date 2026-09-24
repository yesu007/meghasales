'use client';

import { Fragment, Dispatch, SetStateAction, useCallback, useEffect, useMemo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import AddableSelect from '@/components/AddableSelect';

// Mirrors src/components/projects/ProjectFormDrawer.tsx's drawer shell
// (width, header, spacing, Cancel/Save buttons, Lead/Customer/Vertical/Head
// picker behavior) — Product Master is the same shape as Project Master
// (see the Product model's own schema comment), so this is a standalone
// copy with its own constants/state/endpoint rather than a shared
// component, same reasoning CustomerFormDrawer gives for not depending on
// LeadFormDrawer's internals.

interface CustomerOption { id: number; companyName: string; businessVerticals: string | null }
interface LeadOption { id: number; companyName: string; contactPerson: string; businessVerticals: string | null }
interface VerticalOption { id: number; name: string; headId: number | null; headName: string | null; isProductVertical: boolean }

async function fetchCustomerOptions(): Promise<CustomerOption[]> {
  const res = await fetch('/api/leads?status=CONFIRMED&size=100&sortBy=companyName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch customers');
  const data = await res.json();
  return data.content;
}
async function fetchLeadOptions(): Promise<LeadOption[]> {
  const res = await fetch('/api/leads?size=100&sortBy=companyName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch leads');
  const data = await res.json();
  return data.content;
}
async function fetchVerticalOptions(): Promise<VerticalOption[]> {
  const res = await fetch('/api/verticals');
  if (!res.ok) throw new Error('Failed to fetch verticals');
  return res.json();
}

export interface ProductFormState {
  productName: string;
  customerId: string;
  leadId: string;
  verticalId: string;
  headId: string;
  budget: string;
}

export const blankProductForm: ProductFormState = {
  productName: '', customerId: '', leadId: '', verticalId: '', headId: '', budget: '',
};

// Customer and Lead are mutually exclusive — exactly one must be set.
export function validateProductForm(data: ProductFormState): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.productName.trim()) errs.productName = 'Product name is required';
  if (data.customerId && data.leadId) errs.customerId = 'Select either a Customer or a Lead, not both';
  if (!data.customerId && !data.leadId) errs.customerId = 'Select a Customer or a Lead';
  if (!data.verticalId) errs.verticalId = 'Vertical is required';
  if (!data.headId) errs.headId = 'Head is required';
  if (data.budget === '') errs.budget = 'Budget is required';
  return errs;
}

// Toast copy for the single-missing-field case — kept separate from the
// inline messages above (those stay as-is under each field) so the two can
// read differently: e.g. "Please select a Customer or a Lead" here vs.
// "Select a Customer or a Lead" inline.
const REQUIRED_FIELD_TOASTS: Record<string, string> = {
  productName: 'Product Name is required',
  customerId: 'Please select a Customer or a Lead',
  verticalId: 'Vertical is required',
  headId: 'Head is required',
  budget: 'Budget is required',
};

export interface ProductFormDrawerProps {
  open: boolean;
  onClose: () => void;
  editingId: number | null;
  form: ProductFormState;
  setForm: Dispatch<SetStateAction<ProductFormState>>;
  formErrors: Record<string, string>;
  setFormErrors: Dispatch<SetStateAction<Record<string, string>>>;
  onSave: (data: ProductFormState) => void;
  isSaving: boolean;
  // "+ Add Customer" option at the bottom of the Customer dropdown — same
  // Customer-module round-trip as ProjectFormDrawer's own onAddCustomer
  // (stash form state, navigate to /dashboard/customers, come back with
  // the new customer preselected — see the Products page's own handler).
  // Optional so any other caller of this drawer that doesn't wire it up
  // simply doesn't get the option rendered.
  onAddCustomer?: () => void;
}

export default function ProductFormDrawer({
  open, onClose, editingId, form, setForm, formErrors, setFormErrors, onSave, isSaving, onAddCustomer,
}: ProductFormDrawerProps) {
  const { data: customers = [] } = useQuery({ queryKey: ['customers-for-product'], queryFn: fetchCustomerOptions });
  const { data: leads = [] } = useQuery({ queryKey: ['leads-for-product'], queryFn: fetchLeadOptions });
  const { data: verticalOptions = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticalOptions });

  // Clears one field's stale validation message as soon as the user
  // actually changes it — validateProductForm only runs again on the next
  // submit, so without this a message set by a failed submit attempt would
  // otherwise keep showing even after the field now holds a valid value.
  const clearFieldError = useCallback((key: string) => {
    setFormErrors((fe) => (key in fe ? Object.fromEntries(Object.entries(fe).filter(([k]) => k !== key)) : fe));
  }, [setFormErrors]);

  // Product Name is no longer free text — it's a pick from the Vertical
  // Master's own catalog of "Product Vertical"-flagged verticals (see the
  // Vertical form's own "Product Vertical" checkbox), so the two are the
  // same underlying row: picking a name IS picking its vertical. A
  // currently-selected vertical is always kept in the list even if it's
  // since been unflagged (or was set before this feature existed), so
  // editing an older Product still shows its real Product Name/Vertical
  // instead of silently blanking the dropdown.
  const productVerticalOptions = useMemo(
    () => verticalOptions.filter(v => v.isProductVertical || String(v.id) === form.verticalId),
    [verticalOptions, form.verticalId]
  );

  // Head is never picked directly — it's the Vertical Master's own Head
  // assignment (Vertical.headId/headName, already returned by
  // /api/verticals), so it rides along with whichever Vertical is currently
  // selected rather than needing its own users lookup.
  const selectedVertical = verticalOptions.find(v => String(v.id) === form.verticalId);

  // Vertical is fully derived from the Product Name pick above (see its own
  // onChange) — never independently selected, so unlike Head there's no
  // separate effect keeping it in sync; this just clears its own stale
  // "required" message the moment a Product Name sets it.
  useEffect(() => {
    if (form.verticalId) clearFieldError('verticalId');
  }, [form.verticalId, clearFieldError]);

  // Head just mirrors whichever Vertical is selected — clear it here rather
  // than in the effect above so it stays in sync even when the user changes
  // the Vertical selection directly (not just via the Lead/Customer effect).
  useEffect(() => {
    const nextHeadId = selectedVertical?.headId ? String(selectedVertical.headId) : '';
    setForm(f => (f.headId === nextHeadId ? f : { ...f, headId: nextHeadId }));
    // Keyed on the primitive id, not the selectedVertical object (a new
    // reference every render), to avoid re-running this every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVertical?.headId, setForm]);
  // headId is never changed via a direct onChange (it just mirrors the
  // selected Vertical above) — clear its own stale "required" message here
  // instead, the moment it resolves to a real value.
  useEffect(() => {
    if (form.headId) clearFieldError('headId');
  }, [form.headId, clearFieldError]);

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
                    <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Product' : 'Create New Product'}</Dialog.Title>
                    <button onClick={handleClose} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const errs = validateProductForm(form);
                    setFormErrors(errs);
                    const errorKeys = Object.keys(errs);
                    if (errorKeys.length === 1) { toast.error(REQUIRED_FIELD_TOASTS[errorKeys[0]]); return; }
                    if (errorKeys.length > 1) { toast.error('Please fill the required fields'); return; }
                    onSave(form);
                  }} className="flex-1 px-4 sm:px-6 py-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Product Name *</label>
                        {/* Sourced from the Vertical Master's own "Product
                            Vertical"-flagged rows (see productVerticalOptions'
                            own comment above) — picking a name picks that same
                            row's id, which also drives the read-only Vertical
                            display below. Same search+select UI as Lead/
                            Customer/Vertical elsewhere in this app
                            (AddableSelect) — no "+ Add …" action, this only
                            ever picks from the existing catalog. */}
                        <AddableSelect
                          value={form.verticalId}
                          onChange={(v) => {
                            const vertical = verticalOptions.find(opt => String(opt.id) === v);
                            setForm(f => ({ ...f, verticalId: v, productName: vertical?.name || '' }));
                            clearFieldError('productName');
                            clearFieldError('verticalId');
                          }}
                          options={productVerticalOptions.map(v => ({ value: String(v.id), label: v.name }))}
                          placeholder="Select Product Name"
                          error={!!formErrors.productName}
                        />
                        {formErrors.productName && <p className="text-xs text-red-600 mt-1">{formErrors.productName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Lead</label>
                        {/* Same search+select UI as the Customer field just
                            to the right (AddableSelect) — deliberately no
                            "+ Add …" action here, this only ever picks from
                            existing Leads. */}
                        <AddableSelect
                          value={form.leadId}
                          onChange={(v) => { setForm(f => ({ ...f, leadId: v })); clearFieldError('customerId'); }}
                          options={leads.map(l => ({ value: String(l.id), label: l.companyName }))}
                          placeholder="Select Lead"
                          disabled={!!form.customerId}
                          error={!!formErrors.customerId}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                        {/* "+ Add Customer" pinned at the bottom — see
                            onAddCustomer's own comment on the Products
                            page's round-trip to the Customer module and
                            back with the new Customer preselected. */}
                        <AddableSelect
                          value={form.customerId}
                          onChange={(v) => { setForm(f => ({ ...f, customerId: v })); clearFieldError('customerId'); }}
                          options={customers.map(c => ({ value: String(c.id), label: c.companyName }))}
                          placeholder="Select Customer"
                          onAdd={() => onAddCustomer?.()}
                          addLabel="Add Customer"
                          disabled={!!form.leadId}
                          error={!!formErrors.customerId}
                        />
                      </div>
                      {formErrors.customerId && <p className="col-span-1 sm:col-span-2 -mt-3 text-xs text-red-600">{formErrors.customerId}</p>}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Vertical *</label>
                        {/* Auto-populated from the selected Product Name above
                            — never independently picked, same read-only
                            convention as Head just to the right. */}
                        <p className={`w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 ${formErrors.verticalId ? 'border-red-400' : 'border-slate-200'} ${selectedVertical?.name ? 'text-slate-700' : 'text-slate-400'}`}>
                          {selectedVertical?.name || 'Select a Product Name first'}
                        </p>
                        {formErrors.verticalId && <p className="text-xs text-red-600 mt-1">{formErrors.verticalId}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Head *</label>
                        <p className={`w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 ${formErrors.headId ? 'border-red-400' : 'border-slate-200'} ${selectedVertical?.headName ? 'text-slate-700' : 'text-slate-400'}`}>
                          {selectedVertical?.headName || 'No head assigned'}
                        </p>
                        {formErrors.headId && <p className="text-xs text-red-600 mt-1">{formErrors.headId}</p>}
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Budget *</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={form.budget}
                          onChange={(e) => { setForm(f => ({ ...f, budget: e.target.value })); clearFieldError('budget'); }}
                          placeholder="e.g. 500000"
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.budget ? 'border-red-400' : 'border-slate-300'}`}
                        />
                        {formErrors.budget && <p className="text-xs text-red-600 mt-1">{formErrors.budget}</p>}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={handleClose} className="px-4 py-2 min-h-[44px] text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={isSaving} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Product'}
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
