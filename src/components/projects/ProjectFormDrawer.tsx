'use client';

import { Fragment, Dispatch, SetStateAction, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Mirrors src/components/leads/LeadFormDrawer.tsx's drawer shell (width,
// header, spacing, Cancel/Save buttons) so Add Project visually matches Add
// Lead, per that form being the reference design for this one. Each picker
// fetches its own options here, same self-contained convention as
// LeadFormDrawer's own fetchVerticalOptions.

interface CustomerOption { id: number; companyName: string; businessVerticals: string | null }
interface LeadOption { id: number; companyName: string; contactPerson: string; businessVerticals: string | null }
interface VerticalOption { id: number; name: string; headId: number | null; headName: string | null }

// Lead.businessVerticals stores a JSON-encoded vertical name (see
// LeadFormDrawer's own fetchLeadForEdit) — same decode as
// src/app/dashboard/implementations/page.tsx's own parseVerticalName, since
// this is the same value, just read from a different picker here.
function parseVerticalName(raw: string | null): string | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

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

export interface ProjectFormState {
  projectName: string;
  customerId: string;
  leadId: string;
  verticalId: string;
  headId: string;
  budget: string;
}

export const blankProjectForm: ProjectFormState = {
  projectName: '', customerId: '', leadId: '', verticalId: '', headId: '', budget: '',
};

// Customer and Lead are mutually exclusive — exactly one must be set.
export function validateProjectForm(data: ProjectFormState): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!data.projectName.trim()) errs.projectName = 'Project name is required';
  if (data.customerId && data.leadId) errs.customerId = 'Select either a Customer or a Lead, not both';
  if (!data.customerId && !data.leadId) errs.customerId = 'Select a Customer or a Lead';
  if (!data.verticalId) errs.verticalId = 'Vertical is required';
  if (!data.headId) errs.headId = 'Head is required';
  if (data.budget === '') errs.budget = 'Budget is required';
  return errs;
}

export interface ProjectFormDrawerProps {
  open: boolean;
  onClose: () => void;
  editingId: number | null;
  form: ProjectFormState;
  setForm: Dispatch<SetStateAction<ProjectFormState>>;
  formErrors: Record<string, string>;
  setFormErrors: Dispatch<SetStateAction<Record<string, string>>>;
  onSave: (data: ProjectFormState) => void;
  isSaving: boolean;
}

export default function ProjectFormDrawer({
  open, onClose, editingId, form, setForm, formErrors, setFormErrors, onSave, isSaving,
}: ProjectFormDrawerProps) {
  const { data: customers = [] } = useQuery({ queryKey: ['customers-for-project'], queryFn: fetchCustomerOptions });
  const { data: leads = [] } = useQuery({ queryKey: ['leads-for-project'], queryFn: fetchLeadOptions });
  const { data: verticalOptions = [] } = useQuery({ queryKey: ['verticals'], queryFn: fetchVerticalOptions });

  // Vertical is freely selectable — the Lead/Customer's own business
  // vertical (Lead.businessVerticals) is only used to *suggest* an initial
  // pick when one is first selected, matching Implementations page's read
  // of the same field. It never overrides a vertical the user has already
  // chosen, so switching the suggestion source (or picking a different
  // Lead/Customer afterward) doesn't silently clobber a manual selection.
  const selectedLead = leads.find(l => String(l.id) === form.leadId);
  const selectedCustomer = customers.find(c => String(c.id) === form.customerId);
  const sourceVerticalName = form.leadId
    ? parseVerticalName(selectedLead?.businessVerticals ?? null)
    : form.customerId
      ? parseVerticalName(selectedCustomer?.businessVerticals ?? null)
      : null;
  const suggestedVertical = verticalOptions.find(v => v.name === sourceVerticalName);

  // Head is never picked directly — it's the Vertical Master's own Head
  // assignment (Vertical.headId/headName, already returned by
  // /api/verticals), so it rides along with whichever Vertical is currently
  // selected rather than needing its own users lookup.
  const selectedVertical = verticalOptions.find(v => String(v.id) === form.verticalId);

  useEffect(() => {
    if (!form.leadId && !form.customerId) {
      setForm(f => (f.verticalId ? { ...f, verticalId: '' } : f));
      return;
    }
    // Only fills in a blank Vertical — never overwrites one already set, so
    // this can't fight a manual selection made after picking a Lead/Customer.
    if (form.verticalId || !suggestedVertical) return;
    setForm(f => ({ ...f, verticalId: String(suggestedVertical.id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // omits form.verticalId/suggestedVertical from deps: this should only
    // react to a Lead/Customer being (de)selected, not re-fire (and
    // potentially re-suggest) every time the form's own vertical changes.
  }, [form.leadId, form.customerId]);

  // Head just mirrors whichever Vertical is selected — clear it here rather
  // than in the effect above so it stays in sync even when the user changes
  // the Vertical selection directly (not just via the Lead/Customer effect).
  useEffect(() => {
    const nextHeadId = selectedVertical?.headId ? String(selectedVertical.headId) : '';
    setForm(f => (f.headId === nextHeadId ? f : { ...f, headId: nextHeadId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the
    // primitive id, not the selectedVertical object (a new reference every
    // render), to avoid re-running this every render.
  }, [selectedVertical?.headId]);

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
                    <Dialog.Title className="text-lg font-semibold text-slate-800">{editingId ? 'Edit Project' : 'Create New Project'}</Dialog.Title>
                    <button onClick={handleClose} className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded"><XMarkIcon className="h-5 w-5" /></button>
                  </div>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const errs = validateProjectForm(form);
                    setFormErrors(errs);
                    if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
                    onSave(form);
                  }} className="flex-1 px-4 sm:px-6 py-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
                        <input
                          value={form.projectName}
                          onChange={(e) => setForm(f => ({ ...f, projectName: e.target.value }))}
                          placeholder="e.g. Salem ERP Rollout"
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.projectName ? 'border-red-400' : 'border-slate-300'}`}
                        />
                        {formErrors.projectName && <p className="text-xs text-red-600 mt-1">{formErrors.projectName}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Lead</label>
                        <select
                          value={form.leadId}
                          disabled={!!form.customerId}
                          onChange={(e) => setForm(f => ({ ...f, leadId: e.target.value }))}
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.customerId ? 'border-red-400' : 'border-slate-300'} ${form.customerId ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select Lead</option>
                          {leads.map(l => <option key={l.id} value={l.id}>{l.companyName} — {l.contactPerson}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                        <select
                          value={form.customerId}
                          disabled={!!form.leadId}
                          onChange={(e) => setForm(f => ({ ...f, customerId: e.target.value }))}
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.customerId ? 'border-red-400' : 'border-slate-300'} ${form.leadId ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select Customer</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
                        </select>
                      </div>
                      {formErrors.customerId && <p className="col-span-1 sm:col-span-2 -mt-3 text-xs text-red-600">{formErrors.customerId}</p>}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Vertical *</label>
                        <select
                          value={form.verticalId}
                          onChange={(e) => setForm(f => ({ ...f, verticalId: e.target.value }))}
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.verticalId ? 'border-red-400' : 'border-slate-300'}`}
                        >
                          <option value="">Select Vertical</option>
                          {verticalOptions.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
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
                          onChange={(e) => setForm(f => ({ ...f, budget: e.target.value }))}
                          placeholder="e.g. 500000"
                          className={`w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors.budget ? 'border-red-400' : 'border-slate-300'}`}
                        />
                        {formErrors.budget && <p className="text-xs text-red-600 mt-1">{formErrors.budget}</p>}
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <button type="button" onClick={handleClose} className="px-4 py-2 min-h-[44px] text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                      <button type="submit" disabled={isSaving} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                        {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Project'}
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
