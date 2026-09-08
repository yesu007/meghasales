'use client';

import { Fragment, Dispatch, SetStateAction, useState } from 'react';
import { Dialog, Transition, Combobox } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon, ChevronUpDownIcon, CheckIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import CountrySelect, { type Country } from '@/components/CountrySelect';
import AddableSelect from '@/components/AddableSelect';
import { useLeadSources } from '@/hooks/useLeadSources';
import { useStages } from '@/hooks/useStages';
import { isValidEmail } from '@/lib/email';
import { parseBusinessVerticals } from '@/lib/businessVerticals';

// Product / Project picker — reuses the exact same GET /api/projects and
// GET /api/verticals every other Master-linked dropdown in this app already
// calls (no new endpoint, no duplicated Product/Project Master logic). Same
// option shapes as ProjectFormDrawer/ProductFormDrawer's own fetchers.
//
// Product itself has no "pick an existing Product row" mode (unlike
// Project) — every Product Master row is already owned by exactly one
// Customer/Lead (see the Product model's own comment), so picking someone
// else's row here would just be wrong. Instead this picks a Product Name
// from the Vertical Master's own "Product Vertical"-flagged verticals —
// the exact same catalog ProductFormDrawer's own Product Name field
// sources from — and POST /api/customers always creates a brand new
// Product Master row for the new Customer, mirroring the "Create New
// Project" sub-flow (see newProjectVerticalId below) rather than a second,
// independent creation path.
interface ProjectOption { id: number; projectName: string; verticalId: number; verticalName: string }
interface VerticalOption { id: number; name: string; headId: number | null; isProductVertical: boolean }
async function fetchProjectOptions(): Promise<ProjectOption[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}
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

export interface CustomerFormState {
  companyName: string;
  // Product / Project — '' means the field is left alone entirely (fully
  // optional, same as it was before this existed).
  productOrProject: '' | 'PRODUCT' | 'PROJECT';
  // Picks a Product Name (a "Product Vertical"-flagged Vertical — see this
  // file's own top-of-file comment) — always creates a brand new Product
  // Master row for the new Customer at Save time, never links to an
  // existing one, same "own picker field" convention as Lead.productId.
  newProductVerticalId: string;
  // Either an existing Project is picked (projectId set, isNewProject
  // false) or a brand new one is being created inline (isNewProject true,
  // newProjectName/newProjectVerticalId set instead — projectId only
  // becomes real once the Project is actually created, at Save Customer
  // time, since Project.customerId needs this customer to already exist).
  projectId: string;
  isNewProject: boolean;
  newProjectName: string;
  newProjectVerticalId: string;
  contactPerson: string;
  designation: string;
  mobile: string;
  email: string;
  // Dedicated recipient for payment reminders — required, unlike `email`
  // above. See schema.prisma's Lead.financeEmail comment.
  financeEmail: string;
  leadSource: string;
  // Customer lifecycle status (Active/In-Active/Hold — see
  // src/lib/customerStatus.ts). Not collected on this form (Stage is shown
  // here instead, per product request) — always defaults to ACTIVE at
  // creation and is edited later from the Customer main table/edit form.
  customerStatus: string;
  // This Customer's own Implementation stage (see the Stage model /
  // useStages), shown here in place of Status. Optional, same as the
  // Customer table's own Stage dropdown. On create, POST /api/customers
  // creates the Implementation record up front with this as its
  // currentStage; on edit, it reads/updates that same record instead of
  // leaving it to be created/changed lazily elsewhere.
  stage: string;
  businessVerticals: string[];
  countryId: number | null;
  currencyCode: string;
  currencySymbol: string;
  taxType: string;
  state: string;
  city: string;
  // Contact-level address on the Lead/Customer itself — distinct from the
  // Legal Entity's own address below (a per-country legal registration).
  addressLine1: string;
  addressLine2: string;
  notes: string;
  // Legal Entity for the selected country, under the Customer Company
  // Master (find-or-created by companyName — see /api/customers). A second
  // customer for the same company with a different country selected adds a
  // second entity under the same company, rather than a disconnected one.
  legalName: string;
  taxRegistrationNumber: string;
  legalAddressLine1: string;
  legalAddressLine2: string;
  postalCode: string;
}

export const blankCustomerForm: CustomerFormState = {
  companyName: '',
  productOrProject: '', newProductVerticalId: '', projectId: '', isNewProject: false, newProjectName: '', newProjectVerticalId: '',
  contactPerson: '', designation: '', mobile: '', email: '', financeEmail: '', leadSource: '', customerStatus: 'ACTIVE', stage: '', businessVerticals: [],
  countryId: null, currencyCode: '', currencySymbol: '', taxType: '',
  state: '', city: '', addressLine1: '', addressLine2: '', notes: '',
  legalName: '', taxRegistrationNumber: '', legalAddressLine1: '', legalAddressLine2: '', postalCode: '',
};

export interface CustomerCurrencyOption {
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
}

// Fetches a directly-created Customer and shapes it into CustomerFormState
// — used only by the Customers page's own isDirectCustomer-routed Edit
// (a Lead-converted Customer keeps using LeadFormDrawer's own
// fetchLeadForEdit instead). originalProjectId/originalProductId/
// originalProductVerticalId are returned alongside the form (not folded
// into it) so the Customers page's own save orchestration can tell
// whether the user actually changed either — same "state that must never
// end up on the wire by just being part of the form" reasoning as
// LeadFormDrawer's own fetchLeadProductInfo split.
export async function fetchCustomerForEdit(id: number): Promise<{
  form: CustomerFormState;
  originalProjectId: number | null;
  originalProductId: number | null;
  originalProductVerticalId: string;
  // This Customer's own most-recently-created Implementation id (see
  // GET /api/leads/[id]'s own implementations include) — null if it
  // doesn't have one yet, same "create on first use" case as
  // originalProductId above.
  originalImplementationId: number | null;
} | null> {
  const res = await fetch(`/api/leads/${id}`);
  if (!res.ok) return null;
  const lead = await res.json();
  const businessVerticals = parseBusinessVerticals(lead.businessVerticals);

  // Project and Product are mutually exclusive on this form (see
  // productOrProject's own comment) — a Customer only ever has one of
  // Lead.projectId/productId set, matching which type this resolves to.
  let productOrProject: CustomerFormState['productOrProject'] = '';
  let projectId = '';
  let newProductVerticalId = '';
  if (lead.projectId) {
    productOrProject = 'PROJECT';
    projectId = String(lead.projectId);
  } else if (lead.productId) {
    productOrProject = 'PRODUCT';
    newProductVerticalId = lead.linkedProduct?.verticalId ? String(lead.linkedProduct.verticalId) : '';
  }

  return {
    form: {
      companyName: lead.companyName || '',
      productOrProject, projectId, newProductVerticalId,
      isNewProject: false, newProjectName: '', newProjectVerticalId: '',
      contactPerson: lead.contactPerson || '',
      designation: lead.designation || '',
      mobile: lead.mobile || '',
      email: lead.email || '',
      financeEmail: lead.financeEmail || '',
      leadSource: lead.leadSource || '',
      customerStatus: lead.customerStatus || 'ACTIVE',
      stage: lead.implementations?.[0]?.currentStage || '',
      businessVerticals,
      countryId: lead.countryId || null,
      currencyCode: lead.currencyCode || '',
      currencySymbol: lead.currencySymbol || '',
      taxType: lead.taxType || '',
      state: lead.state || '',
      city: lead.city || '',
      addressLine1: lead.addressLine1 || '',
      addressLine2: lead.addressLine2 || '',
      notes: lead.notes || '',
      legalName: lead.legalEntity?.legalName || '',
      taxRegistrationNumber: lead.legalEntity?.taxRegistrationNumber || '',
      legalAddressLine1: lead.legalEntity?.addressLine1 || '',
      legalAddressLine2: lead.legalEntity?.addressLine2 || '',
      postalCode: lead.legalEntity?.postalCode || '',
    },
    originalProjectId: lead.projectId ?? null,
    originalProductId: lead.productId ?? null,
    originalProductVerticalId: newProductVerticalId,
    originalImplementationId: lead.implementations?.[0]?.id ?? null,
  };
}

// verticalOptions is optional (defaults to none checked) purely so existing
// callers/tests that don't care about the Head check don't have to pass it —
// every real call site in this file does pass the live list, so the check
// below always runs where it matters.
export function validateCustomerForm(data: CustomerFormState, verticalOptions: VerticalOption[] = []): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.companyName) errs.companyName = 'Company name is required';
  if (!data.contactPerson) errs.contactPerson = 'Contact person is required';
  if (!data.mobile) errs.mobile = 'Mobile is required';
  if (!data.financeEmail) errs.financeEmail = 'Finance email is required';
  else if (!isValidEmail(data.financeEmail)) errs.financeEmail = 'Enter a valid finance email address';
  if (!data.leadSource) errs.leadSource = 'Source is required';
  if (!data.countryId) errs.countryId = 'Country is required';
  // Product / Project itself stays fully optional (matches this field not
  // existing at all before) — these only fire once the user has actually
  // picked a type and left it incomplete.
  if (data.productOrProject === 'PRODUCT') {
    if (!data.newProductVerticalId) errs.productOrProject = 'Select a Product';
    else {
      // Same rule POST /api/customers (and POST /api/products) enforces
      // server-side — caught here too so the user sees it immediately,
      // before a Customer is ever created, rather than after a failed save.
      const picked = verticalOptions.find(v => String(v.id) === data.newProductVerticalId);
      if (picked && !picked.headId) errs.productOrProject = "Selected product's vertical has no Head assigned — choose a different product";
    }
  }
  if (data.productOrProject === 'PROJECT') {
    if (!data.projectId && !data.isNewProject) errs.productOrProject = 'Select an existing Project, or type a new Project name and press Enter';
    else if (data.isNewProject) {
      if (!data.newProjectVerticalId) errs.newProjectVerticalId = 'Select a Vertical for the new Project';
      else {
        // Same rule POST /api/customers (and POST /api/projects) enforces
        // server-side — caught here too so the user sees it immediately,
        // before a Customer is ever created, rather than after a failed
        // save.
        const picked = verticalOptions.find(v => String(v.id) === data.newProjectVerticalId);
        if (picked && !picked.headId) errs.newProjectVerticalId = 'Selected vertical has no Head assigned — choose a different vertical';
      }
    }
  }
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
  // Present only when editing a Customer created directly from this module
  // (see the Customers page's own isDirectCustomer-based Edit routing) —
  // a Lead-converted Customer keeps using LeadFormDrawer's own Edit
  // instead. Only changes the title/button copy and which endpoint
  // onSave's caller hits; every field below behaves identically either way.
  editingId?: number | null;
  // True only when this drawer was opened via a Project/Product module's
  // own "+ Add Customer" round-trip (see the Customers page's own
  // `returnTo`) — that flow's Product/Project association is meant to
  // happen through the Project/Product Master's own form once the user
  // returns there, not picked manually on this one. False/omitted for a
  // plain "+ Create Customer" click on this page itself (direct creation,
  // where the field stays fully interactive) and for Edit. Disables the
  // field (never hides it) so the user can still see it's there, just not
  // interactive — no options are fetched/rendered while true, matching
  // "don't even load selectable values" for this case.
  disableProductProject?: boolean;
}

export default function CustomerFormDrawer({
  open, onClose, form, setForm, formErrors, setFormErrors, onSave, isSaving, isAdmin, currencies, editingId, disableProductProject,
}: CustomerFormDrawerProps) {
  const sources = useLeadSources();
  const stages = useStages();
  const { data: projectOptions = [] } = useQuery({ queryKey: ['projects-for-customer-create'], queryFn: fetchProjectOptions, enabled: !disableProductProject && form.productOrProject === 'PROJECT' });
  // Needed whenever either type is active — Project's new-Project picker and
  // its existing-Project Vertical display both need it (see their own
  // comments below), and Product's own picker sources from it directly.
  // Never fetched at all while disableProductProject is set — this field
  // can't be interacted with then, so there's nothing for either query to
  // populate.
  const { data: verticalOptions = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticalOptions, enabled: !disableProductProject && (form.productOrProject === 'PROJECT' || form.productOrProject === 'PRODUCT') });
  const selectedExistingProject = projectOptions.find(p => String(p.id) === form.projectId);
  // Product Name options — the Vertical Master's own "Product Vertical"-
  // flagged rows (see this file's own top-of-file comment), same convention
  // as ProductFormDrawer's own productVerticalOptions.
  const productVerticalOptions = verticalOptions.filter(v => v.isProductVertical);

  // Single "select existing OR type a new one" Project field — same
  // Combobox pattern as src/components/leads/LeadPickerCombobox.tsx, but
  // client-filtered (the Project list is already small/fully loaded, same
  // as every other Project dropdown in this app) and with an extra
  // "+ Create ..." option appended whenever the typed text doesn't exactly
  // match an existing Project name. Selecting/Entering that option stages
  // the new Project locally (see the Combobox's own onChange below) —
  // still not actually created until Save Customer, for the same
  // Project.customerId-needs-a-real-customer-id reason as before.
  const [projectQuery, setProjectQuery] = useState('');
  const trimmedProjectQuery = projectQuery.trim();
  const filteredProjectOptions = trimmedProjectQuery
    ? projectOptions.filter(p => p.projectName.toLowerCase().includes(trimmedProjectQuery.toLowerCase()))
    : projectOptions;
  const projectExactMatch = projectOptions.some(p => p.projectName.toLowerCase() === trimmedProjectQuery.toLowerCase());
  // Encodes both branches into one string so Combobox's own value/onChange
  // (which compares by reference for objects) can stay simple primitives —
  // 'existing:<id>' or 'create:<name>'.
  const projectComboValue = form.isNewProject ? `create:${form.newProjectName}` : form.projectId ? `existing:${form.projectId}` : '';

  // Clears one field's stale validation message as soon as the user
  // actually changes it — validateCustomerForm only runs again on the next
  // submit, so without this a message set by a failed submit attempt would
  // otherwise keep showing even after the field now holds a valid value.
  const clearFieldError = (key: string) => setFormErrors((fe) => (key in fe ? Object.fromEntries(Object.entries(fe).filter(([k]) => k !== key)) : fe));

  const handleCountryChange = (country: Country) => {
    setForm((f) => ({
      ...f,
      countryId: country.id,
      currencyCode: country.currencyCode,
      currencySymbol: country.currencySymbol,
      taxType: country.defaultTaxType,
    }));
    clearFieldError('countryId');
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
                    <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Customer' : 'Create New Customer'}</Dialog.Title>
                    <button onClick={handleClose} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const errs = validateCustomerForm(form, verticalOptions);
                    setFormErrors(errs);
                    if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                    onSave(form);
                  }} className="flex-1 px-4 sm:px-6 py-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                        <input value={form.companyName} onChange={(e) => { setForm(f => ({...f, companyName: e.target.value})); clearFieldError('companyName'); }} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.companyName ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.companyName && <p className="text-xs text-red-600 mt-1">{formErrors.companyName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contact Person *</label>
                        <input value={form.contactPerson} onChange={(e) => { setForm(f => ({...f, contactPerson: e.target.value})); clearFieldError('contactPerson'); }} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.contactPerson ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.contactPerson && <p className="text-xs text-red-600 mt-1">{formErrors.contactPerson}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Designation</label>
                        <input value={form.designation} onChange={(e) => setForm(f => ({...f, designation: e.target.value}))} placeholder="e.g. Purchase Manager" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Mobile *</label>
                        <input value={form.mobile} onChange={(e) => { setForm(f => ({...f, mobile: e.target.value})); clearFieldError('mobile'); }} className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.mobile ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.mobile && <p className="text-xs text-red-600 mt-1">{formErrors.mobile}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input type="email" value={form.email} onChange={(e) => setForm(f => ({...f, email: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Finance Email ID *</label>
                        <input type="email" value={form.financeEmail} onChange={(e) => { setForm(f => ({...f, financeEmail: e.target.value})); clearFieldError('financeEmail'); }} placeholder="For payment reminders" className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.financeEmail ? 'border-red-400' : 'border-slate-300'}`} />
                        {formErrors.financeEmail && <p className="text-xs text-red-600 mt-1">{formErrors.financeEmail}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Source *</label>
                        <AddableSelect
                          value={form.leadSource}
                          onChange={(v) => { setForm(f => ({...f, leadSource: v})); clearFieldError('leadSource'); }}
                          options={sources.map(s => ({ value: s.code, label: s.name }))}
                          placeholder="Select Source"
                          error={!!formErrors.leadSource}
                        />
                        {formErrors.leadSource && <p className="text-xs text-red-600 mt-1">{formErrors.leadSource}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Stage</label>
                        {/* Reads/writes this Customer's own most-recently-
                            created Implementation (see fetchCustomerForEdit's
                            own comment) — same record POST /api/customers
                            creates up front from this same field at
                            creation; editing it here updates that same
                            record instead of creating a second one (see the
                            Customers page's own save orchestration). */}
                        <AddableSelect
                          value={form.stage}
                          onChange={(v) => setForm(f => ({...f, stage: v}))}
                          options={stages.map(s => ({ value: s.name, label: s.name }))}
                          placeholder="Select stage"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Product / Project</label>
                        {/* Optional — '' leaves this customer without either,
                            same as before this field existed. Switching type
                            resets whatever the other type had picked, same
                            mutual-exclusivity convention as every other
                            Project/Product toggle in this app (Quotation,
                            Demo, Implementation).
                            Disabled entirely when opened via a Project/
                            Product module's own "+ Add Customer" round-trip
                            (see disableProductProject's own comment) — stays
                            visible (showing whatever it already resolved to,
                            "None" included) so the user can see it's there,
                            just not a place to change it from this form;
                            that association happens from the Project/
                            Product Master's own form once the user returns
                            there instead. */}
                        <AddableSelect
                          value={form.productOrProject}
                          disabled={disableProductProject}
                          onChange={(v) => {
                            const next = v as CustomerFormState['productOrProject'];
                            setForm(f => ({ ...f, productOrProject: next, newProductVerticalId: '', projectId: '', isNewProject: false, newProjectName: '', newProjectVerticalId: '' }));
                            clearFieldError('productOrProject');
                            clearFieldError('newProjectVerticalId');
                          }}
                          options={[
                            { value: '', label: 'None' },
                            { value: 'PRODUCT', label: 'Product' },
                            { value: 'PROJECT', label: 'Project' },
                          ]}
                          placeholder="None"
                          error={!!formErrors.productOrProject}
                        />
                        {formErrors.productOrProject && <p className="text-xs text-red-600 mt-1">{formErrors.productOrProject}</p>}
                      </div>

                      {form.productOrProject === 'PRODUCT' && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                          {/* Picking a name always creates a brand new
                              Product Master row for this Customer at Save
                              time — see this file's own top-of-file
                              comment on why there's no "pick an existing
                              Product row" mode here. */}
                          <AddableSelect
                            value={form.newProductVerticalId}
                            onChange={(v) => { setForm(f => ({ ...f, newProductVerticalId: v })); clearFieldError('productOrProject'); }}
                            options={productVerticalOptions.map(v => ({ value: String(v.id), label: v.name }))}
                            placeholder="Select product"
                            error={!!formErrors.productOrProject}
                          />
                        </div>
                      )}

                      {form.productOrProject === 'PROJECT' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                            {/* One field for both: pick an existing Project
                                from the list, or type a name that doesn't
                                match one and press Enter (or click the
                                "+ Create ..." row) to stage a new Project —
                                it's then listed right in this same dropdown
                                as its own selected/new entry. */}
                            <Combobox
                              value={projectComboValue}
                              onChange={(val: string) => {
                                if (!val) return;
                                if (val.startsWith('create:')) {
                                  const name = val.slice('create:'.length);
                                  setForm(f => ({ ...f, isNewProject: true, projectId: '', newProjectName: name }));
                                  toast.success(`"${name}" will be created as a new Project when you save`);
                                } else {
                                  const id = val.slice('existing:'.length);
                                  setForm(f => ({ ...f, isNewProject: false, newProjectName: '', newProjectVerticalId: '', projectId: id }));
                                }
                                setProjectQuery('');
                                clearFieldError('productOrProject');
                              }}
                            >
                              <div className="relative">
                                <div className="relative w-full cursor-default overflow-hidden rounded-lg border border-slate-300 bg-white text-left focus-within:ring-2 focus-within:ring-amber-500">
                                  <Combobox.Input
                                    className="w-full border-none py-2 min-h-[42px] pl-3 pr-10 text-sm text-slate-800 focus:outline-none focus:ring-0"
                                    displayValue={(val: string) => {
                                      if (!val) return '';
                                      if (val.startsWith('create:')) return val.slice('create:'.length);
                                      const id = val.slice('existing:'.length);
                                      return projectOptions.find(p => String(p.id) === id)?.projectName || '';
                                    }}
                                    onChange={(e) => setProjectQuery(e.target.value)}
                                    placeholder="Select or type a new project name"
                                  />
                                  <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                    <ChevronUpDownIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                                  </Combobox.Button>
                                </div>
                                <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 text-sm shadow-lg border border-slate-200 focus:outline-none">
                                  {/* The just-created (pending, not yet saved) Project — pinned at
                                      the top and always shown once created, regardless of what's
                                      currently typed in the search box, so it stays visible/
                                      selected in this same dropdown rather than disappearing the
                                      moment the query clears. */}
                                  {form.isNewProject && (
                                    <Combobox.Option
                                      value={`create:${form.newProjectName}`}
                                      className={({ active }) => `relative cursor-pointer select-none py-2 pl-3 pr-9 bg-amber-50/70 ${active ? 'bg-amber-100' : ''} text-amber-800`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <PlusIcon className="h-3.5 w-3.5" /> {form.newProjectName}
                                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-500">New</span>
                                      </span>
                                      <span className="absolute inset-y-0 right-2 flex items-center text-amber-600">
                                        <CheckIcon className="h-4 w-4" aria-hidden="true" />
                                      </span>
                                    </Combobox.Option>
                                  )}
                                  {filteredProjectOptions.length === 0 && !trimmedProjectQuery && !form.isNewProject && (
                                    <div className="px-3 py-2 text-slate-400">No projects yet</div>
                                  )}
                                  {filteredProjectOptions.map((p) => (
                                    <Combobox.Option
                                      key={p.id}
                                      value={`existing:${p.id}`}
                                      className={({ active }) => `relative cursor-pointer select-none py-2 pl-3 pr-9 ${active ? 'bg-amber-50 text-amber-900' : 'text-slate-800'}`}
                                    >
                                      {({ selected: isSelected }) => (
                                        <>
                                          <span className={isSelected ? 'font-medium' : ''}>{p.projectName}</span>
                                          {isSelected && (
                                            <span className="absolute inset-y-0 right-2 flex items-center text-amber-600">
                                              <CheckIcon className="h-4 w-4" aria-hidden="true" />
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </Combobox.Option>
                                  ))}
                                  {/* Only offered while the typed text is a genuinely different
                                      new name — not a re-prompt for the pending item already
                                      pinned above. */}
                                  {trimmedProjectQuery && !projectExactMatch && trimmedProjectQuery.toLowerCase() !== form.newProjectName.trim().toLowerCase() && (
                                    <Combobox.Option
                                      value={`create:${trimmedProjectQuery}`}
                                      className={({ active }) => `relative cursor-pointer select-none py-2 pl-3 pr-9 border-t border-slate-100 ${active ? 'bg-amber-50 text-amber-900' : 'text-amber-700'}`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <PlusIcon className="h-3.5 w-3.5" /> Create &ldquo;{trimmedProjectQuery}&rdquo;
                                      </span>
                                    </Combobox.Option>
                                  )}
                                </Combobox.Options>
                              </div>
                            </Combobox>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Vertical {form.isNewProject && '*'}
                            </label>
                            {/* An existing Project's own Vertical is shown
                                (disabled, since it's inherited, not picked)
                                right in this field — same convention as the
                                new-Project case just below, rather than as
                                separate text under the Project field. */}
                            <div title={!form.isNewProject && !selectedExistingProject ? 'Select an existing Project, or type a new Project name and press Enter, first' : undefined}>
                              <AddableSelect
                                value={form.isNewProject ? form.newProjectVerticalId : (selectedExistingProject ? String(selectedExistingProject.verticalId) : '')}
                                disabled={!form.isNewProject}
                                onChange={(v) => { setForm(f => ({ ...f, newProjectVerticalId: v })); clearFieldError('newProjectVerticalId'); }}
                                options={verticalOptions.map(v => ({ value: String(v.id), label: v.name }))}
                                placeholder={form.isNewProject ? 'Select vertical' : 'Select or create a Project first'}
                                error={!!formErrors.newProjectVerticalId}
                              />
                            </div>
                            {formErrors.newProjectVerticalId && <p className="text-xs text-red-600 mt-1">{formErrors.newProjectVerticalId}</p>}
                          </div>
                        </>
                      )}

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
                            <AddableSelect
                              value={form.currencyCode}
                              onChange={(v) => {
                                const c = currencies.find((cur) => cur.currencyCode === v);
                                if (c) setForm(f => ({ ...f, currencyCode: c.currencyCode, currencySymbol: c.currencySymbol }));
                              }}
                              options={currencies.map((c) => ({ value: c.currencyCode, label: `${c.currencyCode} — ${c.currencyName}` }))}
                              placeholder="Select currency"
                            />
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Registered Legal Name</label>
                        <input value={form.legalName} onChange={(e) => setForm(f => ({...f, legalName: e.target.value}))} placeholder={form.companyName || 'Defaults to Company Name'} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tax Registration Number</label>
                        <input value={form.taxRegistrationNumber} onChange={(e) => setForm(f => ({...f, taxRegistrationNumber: e.target.value}))} placeholder="GST / VAT / Tax ID" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 1</label>
                        <input value={form.legalAddressLine1} onChange={(e) => setForm(f => ({...f, legalAddressLine1: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Address Line 2</label>
                        <input value={form.legalAddressLine2} onChange={(e) => setForm(f => ({...f, legalAddressLine2: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Postal Code</label>
                        <input value={form.postalCode} onChange={(e) => setForm(f => ({...f, postalCode: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea rows={3} value={form.notes} onChange={(e) => setForm(f => ({...f, notes: e.target.value}))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={handleClose} className="px-4 py-2 min-h-[44px] text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={isSaving} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Save Customer'}
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
