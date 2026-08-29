'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DocumentIcon, PhotoIcon, TrashIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, EyeIcon, PencilIcon, DocumentTextIcon, PlusIcon, XMarkIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { CONTRACT_STATUSES, CONTRACT_TYPES, contractStatusColor } from '@/lib/customerContractStatus';
import { validateCustomerDocumentFile } from '@/lib/customerDocumentUpload';
import CustomerDocumentUploadBox from './CustomerDocumentUploadBox';

interface ImplementationOption {
  id: number;
  leadId: number;
  projectName: string | null;
}

interface CustomerContract {
  id: number;
  contractType: string;
  projectName: string | null;
  implementationId: number | null;
  implementation: { id: number; projectName: string | null } | null;
  contractDate: string;
  expiryDate: string | null;
  status: string;
  fileName: string | null;
  fileType: string | null;
  mimeType: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  uploadedAt: string | null;
  uploadedBy: { firstName: string; lastName: string } | null;
}

interface ContractFormState {
  contractType: string;
  projectName: string;
  implementationId: string;
  contractDate: string;
  expiryDate: string;
  status: string;
}

const blankForm: ContractFormState = {
  contractType: '', projectName: '', implementationId: '', contractDate: '', expiryDate: '', status: 'DRAFT',
};

function isImage(mimeType: string | null) { return !!mimeType && mimeType.startsWith('image/'); }
function isPdf(mimeType: string | null) { return mimeType === 'application/pdf'; }
function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchContracts(leadId: number): Promise<CustomerContract[]> {
  const res = await fetch(`/api/customers/${leadId}/contracts`);
  if (!res.ok) throw new Error('Failed to load contracts');
  return res.json();
}

// No leadId filter on the existing Implementations API — fetch a
// reasonably-sized page and filter client-side rather than modifying that
// (Implementations-owned) route.
async function fetchImplementations(leadId: number): Promise<ImplementationOption[]> {
  const res = await fetch('/api/implementations?size=100');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.content || []).filter((impl: ImplementationOption) => impl.leadId === leadId);
}

interface CustomerContractsCardProps {
  leadId: number;
  canManage: boolean;
}

export default function CustomerContractsCard({ leadId, canManage }: CustomerContractsCardProps) {
  const queryClient = useQueryClient();
  // The form is always visible when it can be used (same as KYC) — the
  // data model supports many contracts per customer, so "+ New Contract"
  // stays as a convenience reset action (jump back to a blank form while
  // mid-edit of another contract) rather than something required to see
  // the form at all.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ContractFormState>(blankForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: contracts = [], isLoading, isError } = useQuery({
    queryKey: ['customer-contracts', leadId],
    queryFn: () => fetchContracts(leadId),
  });

  const { data: implementations = [] } = useQuery<ImplementationOption[]>({
    queryKey: ['customer-implementations', leadId],
    queryFn: () => fetchImplementations(leadId),
  });

  if (isError) toast.error('Failed to load contracts');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customer-contracts', leadId] });

  // Clears the form back to blank/create-mode — never hides it (there's
  // nothing to hide; the form is always on screen).
  const resetForm = () => { setForm(blankForm); setPendingFile(null); setFormErrors({}); setEditingId(null); };

  const saveMutation = useMutation({
    mutationFn: async ({ data, file, id }: { data: ContractFormState; file: File | null; id: number | null }) => {
      const fd = new FormData();
      fd.append('contractType', data.contractType);
      fd.append('projectName', data.projectName);
      fd.append('implementationId', data.implementationId);
      fd.append('contractDate', data.contractDate);
      fd.append('expiryDate', data.expiryDate);
      fd.append('status', data.status);
      if (file) fd.append('file', file);
      const url = id ? `/api/customers/${leadId}/contracts/${id}` : `/api/customers/${leadId}/contracts`;
      const res = await fetch(url, { method: id ? 'PUT' : 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Failed to save contract');
      }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success(editingId ? 'Contract updated!' : 'Contract saved!'); resetForm(); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/customers/${leadId}/contracts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete contract');
    },
    onSuccess: () => { invalidate(); toast.success('Contract deleted'); },
    onError: () => toast.error('Failed to delete contract'),
  });

  const replaceFileMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/customers/${leadId}/contracts/${id}`, { method: 'PUT', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Failed to replace document');
      }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success('Document replaced!'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeFileMutation = useMutation({
    mutationFn: async (id: number) => {
      const fd = new FormData();
      fd.append('removeFile', 'true');
      const res = await fetch(`/api/customers/${leadId}/contracts/${id}`, { method: 'PUT', body: fd });
      if (!res.ok) throw new Error('Failed to remove document');
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success('Document removed'); },
    onError: () => toast.error('Failed to remove document'),
  });

  const validate = (data: ContractFormState): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!data.contractType) errs.contractType = 'Contract Type is required';
    if (!data.contractDate) errs.contractDate = 'Date is required';
    if (!data.status) errs.status = 'Status is required';
    return errs;
  };

  const openEdit = (contract: CustomerContract) => {
    setForm({
      contractType: contract.contractType,
      projectName: contract.projectName || '',
      implementationId: contract.implementationId ? String(contract.implementationId) : '',
      contractDate: dayjs(contract.contractDate).format('YYYY-MM-DD'),
      expiryDate: contract.expiryDate ? dayjs(contract.expiryDate).format('YYYY-MM-DD') : '',
      status: contract.status,
    });
    setPendingFile(null);
    setEditingId(contract.id);
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 ${formErrors[field] ? 'border-red-400' : 'border-slate-300'}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-800">NDA / Contract</h2>
        </div>
        {canManage && editingId && (
          <button onClick={resetForm} className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">
            <PlusIcon className="h-4 w-4" /> New Contract
          </button>
        )}
      </div>

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const errs = validate(form);
            setFormErrors(errs);
            if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
            saveMutation.mutate({ data: form, file: pendingFile, id: editingId });
          }}
          className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50/50"
        >
          {editingId && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Edit Contract</p>
              <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600" title="Cancel edit"><XMarkIcon className="h-4 w-4" /></button>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contract Type *</label>
              <select value={form.contractType} onChange={(e) => setForm((f) => ({ ...f, contractType: e.target.value }))} className={inputClass('contractType')}>
                <option value="">Select</option>
                {CONTRACT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {formErrors.contractType && <p className="text-xs text-red-600 mt-1">{formErrors.contractType}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
              {implementations.length > 0 ? (
                <select value={form.implementationId} onChange={(e) => {
                  const impl = implementations.find((i) => String(i.id) === e.target.value);
                  setForm((f) => ({ ...f, implementationId: e.target.value, projectName: impl?.projectName || f.projectName }));
                }} className={inputClass('implementationId')}>
                  <option value="">Select existing project (or type below)</option>
                  {implementations.map((impl) => <option key={impl.id} value={impl.id}>{impl.projectName || `Project #${impl.id}`}</option>)}
                </select>
              ) : null}
              <input
                value={form.projectName}
                onChange={(e) => setForm((f) => ({ ...f, projectName: e.target.value, implementationId: '' }))}
                className={`${inputClass('projectName')} ${implementations.length > 0 ? 'mt-2' : ''}`}
                placeholder="Or type a project name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input type="date" value={form.contractDate} onChange={(e) => setForm((f) => ({ ...f, contractDate: e.target.value }))} className={inputClass('contractDate')} />
              {formErrors.contractDate && <p className="text-xs text-red-600 mt-1">{formErrors.contractDate}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expiry / Renewal Date</label>
              <input type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} className={inputClass('expiryDate')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status *</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputClass('status')}>
                {CONTRACT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Generation</label>
              <Link
                href="/dashboard/quotations"
                className={`flex items-center gap-1.5 px-3 py-2 min-h-[40px] border rounded-lg text-sm font-medium ${form.status === 'SIGNED' ? 'border-amber-300 text-amber-700 hover:bg-amber-50' : 'border-slate-200 text-slate-400 pointer-events-none'}`}
                title={form.status === 'SIGNED' ? 'Generate an invoice from an approved Quotation for this customer' : 'Enabled once the contract is Signed'}
              >
                <ReceiptPercentIcon className="h-4 w-4" /> Generate Invoice
              </Link>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Attached File</label>
              <CustomerDocumentUploadBox onFileSelected={(file) => setPendingFile(file)} label={pendingFile ? pendingFile.name : 'Upload Document'} />
            </div>
          </div>
          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
              {saveMutation.isPending ? 'Saving...' : 'Save NDA / Contract'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : contracts.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-2">No contracts added yet</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
          {contracts.map((c) => (
            <div key={c.id} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700">{c.contractType.replace(/_/g, ' ')}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${contractStatusColor(c.status)}`}>{CONTRACT_STATUSES.find((s) => s.value === c.status)?.label || c.status}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{c.projectName || c.implementation?.projectName || 'No project linked'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Date: {dayjs(c.contractDate).format('DD MMM YYYY')}
                    {c.expiryDate && <> · Expires: {dayjs(c.expiryDate).format('DD MMM YYYY')}</>}
                  </p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                    <button onClick={() => { if (window.confirm('Delete this contract?')) deleteMutation.mutate(c.id); }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                  </div>
                )}
              </div>

              {c.fileUrl ? (
                <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isImage(c.mimeType) ? <PhotoIcon className="h-4 w-4 text-slate-400 flex-shrink-0" /> : <DocumentIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700 truncate">{c.fileName}</p>
                      <p className="text-xs text-slate-500">{(c.fileType || '').toUpperCase()} · {formatSize(c.fileSize)}{c.uploadedAt && <> · Uploaded {dayjs(c.uploadedAt).format('DD MMM YYYY')}</>}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(isImage(c.mimeType) || isPdf(c.mimeType)) && (
                      <a href={c.fileUrl} target="_blank" rel="noreferrer" className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="View"><EyeIcon className="h-4 w-4" /></a>
                    )}
                    <a href={c.fileUrl} target="_blank" rel="noreferrer" download className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Download"><ArrowDownTrayIcon className="h-4 w-4" /></a>
                    {canManage && (
                      <>
                        <label className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer" title="Replace">
                          <ArrowUpTrayIcon className="h-4 w-4" />
                          <input type="file" className="hidden" accept=".pdf,.doc,.docx,image/jpeg,image/png" onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            const error = validateCustomerDocumentFile(file);
                            if (error) { toast.error(error); return; }
                            replaceFileMutation.mutate({ id: c.id, file });
                          }} />
                        </label>
                        <button onClick={() => { if (window.confirm('Remove the attached document?')) removeFileMutation.mutate(c.id); }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove"><TrashIcon className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                canManage && <p className="text-xs text-slate-400">No document attached</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
