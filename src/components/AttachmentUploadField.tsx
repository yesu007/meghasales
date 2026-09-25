'use client';

import { useState } from 'react';
import { PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Single-file attach box — same look/behavior as My Reimbursements' own
// "Supporting Document / Receipt" field: upload first to `uploadUrl`
// (returns { url, name }), then the caller saves the returned URL with its
// record. Used by the Mark Paid popups (Expenses, Reimbursement Approvals).
export default function AttachmentUploadField({
  label, uploadUrl, value, onChange, placeholder = 'Attach receipt/bill', onUploadingChange,
}: {
  label: string;
  uploadUrl: string;
  value: { url: string; name: string } | null;
  onChange: (value: { url: string; name: string } | null) => void;
  placeholder?: string;
  // Lets the caller hold its Save button while a file is still uploading.
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const setBusy = (busy: boolean) => { setUploading(busy); onUploadingChange?.(busy); };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(uploadUrl, { method: 'POST', body });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Upload failed');
      onChange({ url: result.url, name: result.name });
      toast.success('File attached');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      {value ? (
        <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm">
          <PaperClipIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="truncate flex-1 text-slate-700">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-slate-400 hover:text-red-600" aria-label="Remove file"><XMarkIcon className="h-4 w-4" /></button>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:bg-slate-50 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <PaperClipIcon className="h-4 w-4" /> {uploading ? 'Uploading...' : placeholder}
          <input type="file" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ''; }} />
        </label>
      )}
    </div>
  );
}
