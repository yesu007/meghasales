'use client';

import { PaperClipIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { validateEventDocumentFile } from '@/lib/eventDocumentUpload';

interface DocumentUploadProps {
  label?: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function DocumentUpload({ label = 'Attach a file', onFileSelected, disabled }: DocumentUploadProps) {
  return (
    <label className={`flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <PaperClipIcon className="h-4 w-4" />
      {label}
      <input
        type="file"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const error = validateEventDocumentFile(file);
          if (error) { toast.error(error); return; }
          onFileSelected(file);
        }}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*"
      />
    </label>
  );
}
