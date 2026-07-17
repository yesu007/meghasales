'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DocumentIcon, PhotoIcon, TrashIcon, ArrowUpTrayIcon, ChevronDownIcon, ChevronUpIcon, ArrowDownTrayIcon, EyeIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import DocumentUpload from './DocumentUpload';

interface DocVersion {
  id: number;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  fileSize: number | null;
  uploadedAt: string;
  uploadedBy: { firstName: string; lastName: string } | null;
}

interface EventDocumentRecord {
  id: number;
  fileName: string;
  description: string | null;
  mimeType: string | null;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string } | null;
  versions: DocVersion[];
  _count?: { versions: number };
}

interface DocumentListProps {
  leadId: number;
  eventId: number;
  canManage: boolean;
}

function isImage(mimeType: string | null) {
  return !!mimeType && mimeType.startsWith('image/');
}
function isPdf(mimeType: string | null) {
  return mimeType === 'application/pdf';
}

async function fetchDocuments(leadId: number, eventId: number): Promise<EventDocumentRecord[]> {
  const res = await fetch(`/api/leads/${leadId}/events/${eventId}/documents`);
  if (!res.ok) throw new Error('Failed to load documents');
  return res.json();
}

export default function DocumentList({ leadId, eventId, canManage }: DocumentListProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['event-documents', eventId],
    queryFn: () => fetchDocuments(leadId, eventId),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/leads/${leadId}/events/${eventId}/documents`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-documents', eventId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      toast.success('Document uploaded!');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const replaceMutation = useMutation({
    mutationFn: async ({ documentId, file }: { documentId: number; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/leads/${leadId}/events/${eventId}/documents/${documentId}/versions`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to upload new version');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-documents', eventId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      toast.success('New version uploaded!');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await fetch(`/api/leads/${leadId}/events/${eventId}/documents/${documentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete document');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-documents', eventId] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      toast.success('Document deleted');
    },
    onError: () => toast.error('Failed to delete document'),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 uppercase">Requirement Documents</p>
        {canManage && (
          <DocumentUpload label="Add Document" onFileSelected={(file) => uploadMutation.mutate(file)} disabled={uploadMutation.isPending} />
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading documents...</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-slate-400">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const latest = doc.versions[0];
            const versionCount = doc._count?.versions ?? doc.versions.length;
            const expanded = expandedId === doc.id;
            return (
              <div key={doc.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isImage(doc.mimeType) ? <PhotoIcon className="h-5 w-5 text-slate-400 flex-shrink-0" /> : <DocumentIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{doc.fileName}</p>
                      <p className="text-xs text-slate-500">
                        v{latest?.versionNumber ?? 1} · {doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : 'Unknown'} · {dayjs(doc.createdAt).format('DD MMM YYYY')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {latest && (isImage(latest.mimeType) || isPdf(latest.mimeType)) && (
                      <a href={latest.fileUrl} target="_blank" rel="noreferrer" className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Preview">
                        <EyeIcon className="h-4 w-4" />
                      </a>
                    )}
                    {latest && (
                      <a href={latest.fileUrl} target="_blank" rel="noreferrer" download className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Download">
                        <ArrowDownTrayIcon className="h-4 w-4" />
                      </a>
                    )}
                    {versionCount > 1 && (
                      <button onClick={() => setExpandedId(expanded ? null : doc.id)} className="p-1.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-50" title="Version history">
                        {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                      </button>
                    )}
                    {canManage && (
                      <label className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer" title="Replace with newer version">
                        <ArrowUpTrayIcon className="h-4 w-4" />
                        <input type="file" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) replaceMutation.mutate({ documentId: doc.id, file });
                        }} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*" />
                      </label>
                    )}
                    {canManage && (
                      <button onClick={() => { if (window.confirm(`Delete "${doc.fileName}"?`)) deleteMutation.mutate(doc.id); }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {doc.description && <p className="text-xs text-slate-500 mt-2">{doc.description}</p>}
                {expanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 uppercase">Version History</p>
                    {doc.versions.map((v) => (
                      <div key={v.id} className="flex items-center justify-between text-xs text-slate-600">
                        <span>v{v.versionNumber} — {v.fileName} · {v.uploadedBy ? `${v.uploadedBy.firstName} ${v.uploadedBy.lastName}` : 'Unknown'} · {dayjs(v.uploadedAt).format('DD MMM YYYY, HH:mm')}</span>
                        <a href={v.fileUrl} target="_blank" rel="noreferrer" className="text-amber-600 hover:underline flex-shrink-0 ml-2">Download</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
