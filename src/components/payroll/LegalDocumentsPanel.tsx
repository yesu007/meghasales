'use client';

// Reused by both Employee Details (Employee → Legal Documents — the same
// page also serves as "Payroll Employee") and My Space → My Documents.
// Which one a given page gets is entirely down to the `apiBase`/`canManage`/
// `canDelete` props — the component itself has no idea whether it's
// looking at "my own" documents or an admin's view of someone else's.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DocumentIcon, PhotoIcon, TrashIcon, EyeIcon, ArrowDownTrayIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import AddableSelect from '@/components/AddableSelect';
import { validateEventDocumentFile } from '@/lib/eventDocumentUpload';

// Free-text pseudo-enum, same convention as Employee.employmentType — see
// EmployeeLegalDocument's schema comment. AddableSelect lets the user type
// a value outside this list too, same as every other picker in the app
// that uses it (Manager, Vertical, ...).
const DOCUMENT_TYPE_OPTIONS = [
  { value: 'AADHAAR', label: 'Aadhaar Card' },
  { value: 'PAN', label: 'PAN Card' },
  { value: 'OFFER_LETTER', label: 'Offer Letter' },
  { value: 'EDUCATION_CERTIFICATE', label: 'Education Certificate' },
  { value: 'EXPERIENCE_LETTER', label: 'Experience Letter' },
  { value: 'ID_PROOF', label: 'ID Proof' },
  { value: 'ADDRESS_PROOF', label: 'Address Proof' },
  { value: 'OTHER', label: 'Other' },
];
const DOCUMENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(DOCUMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

interface LegalDocument {
  id: number;
  documentType: string;
  documentName: string;
  filePath: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  uploadedByName: string | null;
}

interface LegalDocumentsPanelProps {
  apiBase: string; // e.g. `/api/payroll/employees/${id}/documents` or `/api/payroll/my-documents`
  queryKey: string; // distinct react-query cache key per mount context
  canUpload: boolean;
  canDelete: boolean;
  // my-documents' GET returns { employee, documents }; the employee-module
  // GET returns the array directly — this normalizes both into one shape
  // so the component doesn't need two code paths.
  responseHasWrapper?: boolean;
}

function isImage(mimeType: string | null) {
  return !!mimeType && mimeType.startsWith('image/');
}
function isPdf(mimeType: string | null) {
  return mimeType === 'application/pdf';
}
function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchDocuments(apiBase: string, responseHasWrapper: boolean): Promise<LegalDocument[]> {
  const res = await fetch(apiBase);
  if (!res.ok) throw new Error('Failed to load documents');
  const data = await res.json();
  return responseHasWrapper ? data.documents ?? [] : data;
}

export default function LegalDocumentsPanel({ apiBase, queryKey, canUpload, canDelete, responseHasWrapper = false }: LegalDocumentsPanelProps) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [documentType, setDocumentType] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => fetchDocuments(apiBase, responseHasWrapper),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pendingFile) throw new Error('Choose a file first');
      if (!documentType) throw new Error('Select a Document Type first');
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('documentType', documentType);
      const res = await fetch(apiBase, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Document uploaded');
      setShowForm(false);
      setDocumentType('');
      setPendingFile(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await fetch(`${apiBase}/${documentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to delete document');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Document deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">Legal Documents</h2>
        {canUpload && (
          <button onClick={() => setShowForm((v) => !v)} className="text-sm font-medium text-amber-700 hover:text-amber-800">
            {showForm ? 'Cancel' : '+ Add Document'}
          </button>
        )}
      </div>

      {showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 items-end">
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">Document Type *</label>
            <AddableSelect value={documentType} onChange={setDocumentType} options={DOCUMENT_TYPE_OPTIONS} placeholder="Select type" />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs font-medium text-slate-600 mb-1">File *</label>
            <label className={`flex items-center justify-center gap-2 px-3 py-2 min-h-[38px] border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 cursor-pointer`}>
              <PaperClipIcon className="h-4 w-4" />
              {pendingFile ? pendingFile.name : 'Choose file'}
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const error = validateEventDocumentFile(file);
                  if (error) { toast.error(error); return; }
                  setPendingFile(file);
                }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*"
              />
            </label>
          </div>
          <div className="sm:col-span-1">
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !pendingFile || !documentType}
              className="w-full px-4 py-2 min-h-[38px] bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Loading documents...</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-slate-400">No legal documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2 min-w-0">
                {isImage(doc.mimeType) ? <PhotoIcon className="h-5 w-5 text-slate-400 flex-shrink-0" /> : <DocumentIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.documentName}</p>
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 flex-shrink-0">
                      {DOCUMENT_TYPE_LABELS[doc.documentType] || doc.documentType}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {doc.uploadedByName || 'Unknown'} · {dayjs(doc.createdAt).format('DD MMM YYYY')}{doc.size ? ` · ${formatSize(doc.size)}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {(isImage(doc.mimeType) || isPdf(doc.mimeType)) && (
                  <a href={doc.filePath} target="_blank" rel="noreferrer" className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Preview">
                    <EyeIcon className="h-4 w-4" />
                  </a>
                )}
                <a href={doc.filePath} target="_blank" rel="noreferrer" download className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Download">
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </a>
                {canDelete && (
                  <button
                    onClick={() => { if (window.confirm(`Delete "${doc.documentName}"?`)) deleteMutation.mutate(doc.id); }}
                    className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title="Delete"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
