'use client';

import { useState, useRef, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, XMarkIcon, PaperClipIcon, ArrowDownTrayIcon, EyeIcon, PencilIcon, TrashIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddableSelect from '@/components/AddableSelect';
import LeadPickerCombobox, { type LeadOption } from '@/components/leads/LeadPickerCombobox';
import { useProjectsForLead } from '@/hooks/useProjectsForLead';
import { useProductsForLead } from '@/hooks/useProductsForLead';

interface CategoryOption { id: number; name: string }
interface ExpenseClaim {
  id: number;
  expenseDate: string;
  description: string;
  amount: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID';
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
  category: { id: number; name: string };
  lead: { id: number; companyName: string } | null;
  project: { id: number; projectName: string } | null;
  product: { id: number; productName: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-500',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  PAID: 'bg-green-100 text-green-700',
};

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 focus:border-amber-500';

async function fetchMine(): Promise<{ employee: { employeeCode: string } | null; claims: ExpenseClaim[] }> {
  const res = await fetch('/api/payroll/expense-claims/mine');
  if (!res.ok) throw new Error('Failed to fetch reimbursements');
  return res.json();
}
async function fetchCategories(): Promise<CategoryOption[]> {
  const res = await fetch('/api/payroll/expense-claims/categories');
  if (!res.ok) throw new Error('Failed to fetch expense types');
  return res.json();
}

const blankForm = { expenseDate: dayjs().format('YYYY-MM-DD'), categoryId: '', description: '', amount: '', attachmentUrl: '', attachmentName: '' };

export default function MyExpenseClaimsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['my-expense-claims'], queryFn: fetchMine });
  const { data: categories = [] } = useQuery({ queryKey: ['expense-claim-categories'], queryFn: fetchCategories });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState<ExpenseClaim['status'] | null>(null);
  const [form, setForm] = useState(blankForm);
  const [lead, setLead] = useState<LeadOption | null>(null);
  const [projectId, setProjectId] = useState('');
  const [productId, setProductId] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: leadProjects = [] } = useProjectsForLead(lead?.id ?? null);
  // Product is scoped to the same Customer as Project (Product Master has
  // no projectId of its own — see the schema's own comment on
  // ExpenseClaim.productId) — Project just has to be picked first in this
  // form's own sequence before the Product dropdown unlocks.
  const { data: leadProducts = [] } = useProductsForLead(lead?.id ?? null);

  // Clicking Edit must always jump the page to the form and focus its first
  // field — even if the form is already open editing something else, or
  // already open editing this exact same row (see startEdit below, which
  // bumps this on every click). A plain useEffect on editingId wouldn't
  // refire for that last case since the id wouldn't change.
  const formRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);
  useEffect(() => {
    if (focusTrigger === 0) return;
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    firstFieldRef.current?.focus();
  }, [focusTrigger]);

  const resetForm = () => {
    setForm(blankForm);
    setLead(null);
    setProjectId('');
    setProductId('');
    setEditingId(null);
    setEditingStatus(null);
    setShowForm(false);
  };

  const startEdit = (c: ExpenseClaim) => {
    setForm({
      expenseDate: dayjs(c.expenseDate).format('YYYY-MM-DD'),
      categoryId: String(c.category.id),
      description: c.description,
      amount: c.amount,
      attachmentUrl: c.attachmentUrl || '',
      attachmentName: c.attachmentName || '',
    });
    setLead(c.lead ? { id: c.lead.id, companyName: c.lead.companyName, contactPerson: '', status: '' } : null);
    setProjectId(c.project ? String(c.project.id) : '');
    setProductId(c.product ? String(c.product.id) : '');
    setEditingId(c.id);
    setEditingStatus(c.status);
    setShowForm(true);
    setFocusTrigger((n) => n + 1);
  };

  const uploadReceipt = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/payroll/expense-claims/upload', { method: 'POST', body });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Upload failed');
      setForm((f) => ({ ...f, attachmentUrl: result.url, attachmentName: result.name }));
      toast.success('Receipt attached');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const buildPayload = (submit: boolean) => ({
    expenseDate: form.expenseDate,
    categoryId: Number(form.categoryId),
    description: form.description,
    amount: Number(form.amount),
    leadId: lead?.id ?? null,
    projectId: projectId ? Number(projectId) : null,
    productId: productId ? Number(productId) : null,
    attachmentUrl: form.attachmentUrl || null,
    attachmentName: form.attachmentName || null,
    submit,
  });

  const validate = () => {
    if (!form.expenseDate || !form.categoryId || !form.description || !form.amount) {
      toast.error('Expense date, type, description, and amount are required');
      return false;
    }
    if (Number(form.amount) <= 0) {
      toast.error('Amount must be greater than zero');
      return false;
    }
    return true;
  };

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      const payload = buildPayload(submit);
      const url = editingId ? `/api/payroll/expense-claims/mine/${editingId}` : '/api/payroll/expense-claims/mine';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to save reimbursement'); }
      return res.json();
    },
    onSuccess: (_r, submit) => {
      queryClient.invalidateQueries({ queryKey: ['my-expense-claims'] });
      toast.success(submit ? 'Reimbursement submitted for approval' : 'Saved as draft');
      resetForm();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const submitDraft = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/expense-claims/mine/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submit: true }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to submit'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-expense-claims'] }); toast.success('Reimbursement submitted for approval'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/payroll/expense-claims/mine/${id}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete'); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-expense-claims'] }); toast.success('Draft reimbursement deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <div className="text-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>;

  if (!data?.employee) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Reimbursement</h1>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 text-center py-16 text-slate-400">No payroll profile yet — reimbursements will be available once you&apos;re onboarded.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Reimbursement</h1>
          <p className="text-slate-500 mt-0.5 text-sm sm:text-base">{data.employee.employeeCode}</p>
        </div>
        <button onClick={() => (showForm ? resetForm() : setShowForm(true))} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
          <PlusIcon className="h-4 w-4" /> Add Reimbursement
        </button>
      </div>

      {showForm && (
        <div ref={formRef} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-800 mb-3">{editingId ? 'Edit Reimbursement' : 'New Reimbursement'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expense Date</label>
              <input ref={firstFieldRef} type="date" max={dayjs().format('YYYY-MM-DD')} value={form.expenseDate} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expense Type</label>
              <AddableSelect
                value={form.categoryId}
                onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Select expense type"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer (optional)</label>
              <LeadPickerCombobox value={lead} onChange={(l) => { setLead(l); setProjectId(''); setProductId(''); }} placeholder="Search by company or contact name..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project (optional)</label>
              <AddableSelect
                value={projectId}
                onChange={(v) => { setProjectId(v); setProductId(''); }}
                options={leadProjects.map((p) => ({ value: String(p.id), label: p.projectName }))}
                placeholder={lead ? 'Select project' : 'Select a customer first'}
                disabled={!lead}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Product (optional)</label>
              <AddableSelect
                value={productId}
                onChange={setProductId}
                options={leadProducts.map((p) => ({ value: String(p.id), label: p.productName }))}
                placeholder={projectId ? 'Select product' : 'Select a project first'}
                disabled={!projectId}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description / Reason</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} rows={2} placeholder="e.g. Cab fare for customer site visit" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Amount (₹)</label>
              <input type="number" min="1" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supporting Document / Receipt</label>
              {form.attachmentUrl ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm">
                  <PaperClipIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="truncate flex-1 text-slate-700">{form.attachmentName}</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, attachmentUrl: '', attachmentName: '' }))} className="text-slate-400 hover:text-red-600"><XMarkIcon className="h-4 w-4" /></button>
                </div>
              ) : (
                <label className={`flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:bg-slate-50 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <PaperClipIcon className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Attach receipt/bill'}
                  <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadReceipt(file); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={resetForm} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
            {editingStatus === 'SUBMITTED' ? (
              // Already submitted — editing here corrects the claim's own
              // fields only; it stays Submitted rather than being pushed
              // through Draft/Submit again.
              <button type="button" disabled={save.isPending} onClick={() => validate() && save.mutate(false)} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {save.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            ) : (
              <>
                <button type="button" disabled={save.isPending} onClick={() => validate() && save.mutate(false)} className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">
                  Save as Draft
                </button>
                <button type="button" disabled={save.isPending} onClick={() => validate() && save.mutate(true)} className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                  {save.isPending ? 'Submitting...' : 'Submit for Approval'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {data.claims.length === 0 ? (
          <p className="text-center py-16 text-slate-400">No reimbursements yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-white">Expense Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Project</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Product</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Description</th>
                  <th className="px-4 py-3 text-right font-semibold text-white">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-white">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.claims.map((c, idx) => (
                  <Fragment key={c.id}>
                    <tr onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))} className={`cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-amber-50/60 transition-colors`}>
                      <td className="px-4 py-3 text-slate-700">{dayjs(c.expenseDate).format('DD MMM YYYY')}</td>
                      <td className="px-4 py-3 text-slate-600">{c.category.name}</td>
                      <td className="px-4 py-3 text-slate-600">{c.lead?.companyName || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{c.project?.projectName || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{c.product?.productName || '-'}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[16rem] truncate">{c.description}</td>
                      <td className="px-4 py-3 text-right text-slate-700">₹{Number(c.amount).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="View">
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          {c.status === 'DRAFT' && (
                            <button onClick={() => submitDraft.mutate(c.id)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Submit for Approval">
                              <PaperAirplaneIcon className="h-4 w-4" />
                            </button>
                          )}
                          {(c.status === 'DRAFT' || c.status === 'SUBMITTED') && (
                            <>
                              <button onClick={() => startEdit(c)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit">
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button onClick={() => window.confirm('Delete this reimbursement?') && remove.mutate(c.id)} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div><p className="text-xs text-slate-400 uppercase">Submitted</p><p className="text-slate-700">{c.submittedAt ? dayjs(c.submittedAt).format('DD MMM YYYY') : '-'}</p></div>
                            <div><p className="text-xs text-slate-400 uppercase">Approved</p><p className="text-slate-700">{c.approvedAt ? dayjs(c.approvedAt).format('DD MMM YYYY') : '-'}</p></div>
                            <div><p className="text-xs text-slate-400 uppercase">Paid</p><p className="text-slate-700">{c.paidAt ? dayjs(c.paidAt).format('DD MMM YYYY') : '-'}</p></div>
                            <div>
                              <p className="text-xs text-slate-400 uppercase">Receipt</p>
                              {c.attachmentUrl ? (
                                <a href={c.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-amber-700 hover:text-amber-800"><ArrowDownTrayIcon className="h-3.5 w-3.5" /> {c.attachmentName || 'View'}</a>
                              ) : <p className="text-slate-400">None</p>}
                            </div>
                          </div>
                          {c.status === 'REJECTED' && c.rejectionReason && (
                            <p className="text-sm text-red-600 mt-3"><span className="font-medium">Rejection reason:</span> {c.rejectionReason}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
