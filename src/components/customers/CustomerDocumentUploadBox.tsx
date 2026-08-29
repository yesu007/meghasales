'use client';

import { useState } from 'react';
import { CloudArrowUpIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { validateCustomerDocumentFile } from '@/lib/customerDocumentUpload';

interface CustomerDocumentUploadBoxProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  label?: string;
}

// Customer-owned upload box — a bigger, drop-zone-styled variant of
// src/components/leads/DocumentUpload.tsx's file-picker pattern (same
// "label wraps a hidden file input" mechanism — this app doesn't wire up
// real HTML5 drag-and-drop anywhere yet, so this follows that existing
// convention rather than introducing a new one).
export default function CustomerDocumentUploadBox({ onFileSelected, disabled, label = 'Upload Document' }: CustomerDocumentUploadBoxProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const error = validateCustomerDocumentFile(file);
    if (error) { toast.error(error); return; }
    onFileSelected(file);
  };

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (disabled) return;
        handleFile(e.dataTransfer.files?.[0]);
      }}
      className={`flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-lg text-center transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed border-slate-200' : dragOver ? 'border-amber-400 bg-amber-50 cursor-pointer' : 'border-slate-300 hover:border-amber-400 cursor-pointer'
      }`}
    >
      <CloudArrowUpIcon className="h-8 w-8 text-slate-400" />
      <p className="text-sm text-slate-600">Drag &amp; drop a file here, or</p>
      <span className="px-3 py-1.5 min-h-[36px] inline-flex items-center bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700">{label}</span>
      <p className="text-xs text-slate-400">PDF / DOC / DOCX / JPG / PNG · up to 10MB</p>
      <input
        type="file"
        className="hidden"
        disabled={disabled}
        accept=".pdf,.doc,.docx,image/jpeg,image/png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          handleFile(file);
        }}
      />
    </label>
  );
}
