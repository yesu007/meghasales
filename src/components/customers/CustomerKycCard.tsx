'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DocumentIcon, PhotoIcon, TrashIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, EyeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { KYC_VERIFICATION_STATUSES, kycVerificationStatusColor } from '@/lib/customerKycStatus';
import { validateCustomerDocumentFile } from '@/lib/customerDocumentUpload';
import CustomerDocumentUploadBox from './CustomerDocumentUploadBox';

interface UserOption {
  id: number;
  fullName: string;
}

interface KycDocument {
  id: number;
  fileName: string;
  fileType: string | null;
  mimeType: string | null;
  fileUrl: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: { firstName: string; lastName: string } | null;
}

interface CustomerKyc {
  id: number;
  legalCompanyName: string | null;
  registrationTaxId: string | null;
  billingAddress: string | null;
  authorizedContact: string | null;
  verificationStatus: string;
  verifiedById: number | null;
  verifiedAt: string | null;
  verifiedBy: { firstName: string; lastName: string } | null;
  documents: KycDocument[];
}

interface KycFormState {
  legalCompanyName: string;
  registrationTaxId: string;
  billingAddress: string;
  authorizedContact: string;
  verificationStatus: string;
  verifiedById: string;
  verifiedAt: string;
}

const blankForm: KycFormState = {
  legalCompanyName: '', registrationTaxId: '', billingAddress: '', authorizedContact: '',
  verificationStatus: 'PENDING', verifiedById: '', verifiedAt: '',
};

function isImage(mimeType: string | null) { return !!mimeType && mimeType.startsWith('image/'); }
function isPdf(mimeType: string | null) { return mimeType === 'application/pdf'; }
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchKyc(leadId: number): Promise<CustomerKyc | null> {
  const res = await fetch(`/api/customers/${leadId}/kyc`);
  if (!res.ok) throw new Error('Failed to load KYC details');
  return res.json();
}

async function fetchUsers(): Promise<UserOption[]> {
  const res = await fetch('/api/users?size=100&sortBy=firstName&sortDir=asc');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.content.map((u: any) => ({ id: u.id, fullName: u.fullName }));
}

interface CustomerKycCardProps {
  leadId: number;
  canManage: boolean;
}

export default function CustomerKycCard({ leadId, canManage }: CustomerKycCardProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<KycFormState>(blankForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: kyc, isLoading, isError } = useQuery({
    queryKey: ['customer-kyc', leadId],
    queryFn: () => fetchKyc(leadId),
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ['users-for-kyc-verification'],
    queryFn: fetchUsers,
  });

  useEffect(() => {
    if (isError) toast.error('Failed to load KYC details');
  }, [isError]);

  // Populate the form once the record loads — persistence requirement:
  // saved KYC details must still be there after leaving and returning.
  useEffect(() => {
    if (kyc) {
      setForm({
        legalCompanyName: kyc.legalCompanyName || '',
        registrationTaxId: kyc.registrationTaxId || '',
        billingAddress: kyc.billingAddress || '',
        authorizedContact: kyc.authorizedContact || '',
        verificationStatus: kyc.verificationStatus || 'PENDING',
        verifiedById: kyc.verifiedById ? String(kyc.verifiedById) : '',
        verifiedAt: kyc.verifiedAt ? dayjs(kyc.verifiedAt).format('YYYY-MM-DD') : '',
      });
    }
  }, [kyc]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customer-kyc', leadId] });

  const saveMutation = useMutation({
    mutationFn: async (data: KycFormState) => {
      const res = await fetch(`/api/customers/${leadId}/kyc`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Failed to save KYC details');
      }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success('KYC details saved!'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/customers/${leadId}/kyc/documents`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success('KYC document uploaded!'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const replaceMutation = useMutation({
    mutationFn: async ({ documentId, file }: { documentId: number; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/customers/${leadId}/kyc/documents/${documentId}`, { method: 'PUT', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Failed to replace document');
      }
      return res.json();
    },
    onSuccess: () => { invalidate(); toast.success('Document replaced!'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await fetch(`/api/customers/${leadId}/kyc/documents/${documentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove document');
    },
    onSuccess: () => { invalidate(); toast.success('Document removed'); },
    onError: () => toast.error('Failed to remove document'),
  });

  const validate = (data: KycFormState): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!data.legalCompanyName.trim()) errs.legalCompanyName = 'Legal Company Name is required';
    if (data.verificationStatus && !KYC_VERIFICATION_STATUSES.find((s) => s.value === data.verificationStatus)) {
      errs.verificationStatus = 'Invalid verification status';
    }
    return errs;
  };

  const inputClass = (field: string) =>
    `w-full px-3 py-2 border rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-500 ${formErrors[field] ? 'border-red-400' : 'border-slate-300'}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="h-5 w-5 text-amber-600" />
        <h2 className="text-lg font-semibold text-slate-800">KYC</h2>
      </div>

      {isLoading ? (
        <div className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const errs = validate(form);
            setFormErrors(errs);
            if (Object.keys(errs).length > 0) { toast.error('Please fix the errors in the form'); return; }
            saveMutation.mutate(form);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Legal Company Name *</label>
              <input disabled={!canManage} value={form.legalCompanyName} onChange={(e) => setForm((f) => ({ ...f, legalCompanyName: e.target.value }))} className={inputClass('legalCompanyName')} />
              {formErrors.legalCompanyName && <p className="text-xs text-red-600 mt-1">{formErrors.legalCompanyName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Registration / Tax ID</label>
              <input disabled={!canManage} value={form.registrationTaxId} onChange={(e) => setForm((f) => ({ ...f, registrationTaxId: e.target.value }))} className={inputClass('registrationTaxId')} placeholder="GST / VAT / TIN" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Authorized Contact</label>
              <input disabled={!canManage} value={form.authorizedContact} onChange={(e) => setForm((f) => ({ ...f, authorizedContact: e.target.value }))} className={inputClass('authorizedContact')} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Billing Address</label>
              <textarea disabled={!canManage} rows={2} value={form.billingAddress} onChange={(e) => setForm((f) => ({ ...f, billingAddress: e.target.value }))} className={inputClass('billingAddress')} />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">KYC Documents</label>
              {canManage && (
                <CustomerDocumentUploadBox onFileSelected={(file) => uploadMutation.mutate(file)} disabled={uploadMutation.isPending} label="Upload Document" />
              )}
              {kyc && kyc.documents.length > 0 ? (
                <div className="mt-3 divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {kyc.documents.map((doc) => (
                    <div key={doc.id} className="p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isImage(doc.mimeType) ? <PhotoIcon className="h-5 w-5 text-slate-400 flex-shrink-0" /> : <DocumentIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{doc.fileName}</p>
                          <p className="text-xs text-slate-500">{(doc.fileType || '').toUpperCase()} · {formatSize(doc.fileSize)} · Uploaded {dayjs(doc.uploadedAt).format('DD MMM YYYY')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(isImage(doc.mimeType) || isPdf(doc.mimeType)) && (
                          <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="View"><EyeIcon className="h-4 w-4" /></a>
                        )}
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" download className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Download"><ArrowDownTrayIcon className="h-4 w-4" /></a>
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
                                replaceMutation.mutate({ documentId: doc.id, file });
                              }} />
                            </label>
                            <button type="button" onClick={() => { if (window.confirm(`Remove "${doc.fileName}"?`)) deleteMutation.mutate(doc.id); }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-2">No KYC documents uploaded yet</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Verification Status</label>
              <select disabled={!canManage} value={form.verificationStatus} onChange={(e) => setForm((f) => ({ ...f, verificationStatus: e.target.value }))} className={`px-2 py-2 rounded-lg text-sm font-medium border w-full ${kycVerificationStatusColor(form.verificationStatus)}`}>
                {KYC_VERIFICATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Verification By</label>
              <select disabled={!canManage} value={form.verifiedById} onChange={(e) => setForm((f) => ({ ...f, verifiedById: e.target.value }))} className={inputClass('verifiedById')}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Verification Date</label>
              <input disabled={!canManage} type="date" value={form.verifiedAt} onChange={(e) => setForm((f) => ({ ...f, verifiedAt: e.target.value }))} className={inputClass('verifiedAt')} />
            </div>
          </div>

          {canManage && (
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 min-h-[44px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
                {saveMutation.isPending ? 'Saving...' : 'Save KYC'}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
