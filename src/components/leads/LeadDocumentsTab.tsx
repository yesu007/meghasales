'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DocumentIcon, PhotoIcon, TrashIcon, ArrowUpTrayIcon, ChevronDownIcon, ChevronUpIcon, ArrowDownTrayIcon, EyeIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import DocumentUpload from './DocumentUpload';

interface DocVersion {
  id: number;
  versionNumber: number;
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  uploadedAt: string;
  uploadedBy: { firstName: string; lastName: string } | null;
}

interface LeadDocumentRecord {
  id: number;
  eventId: number | null;
  fileName: string;
  description: string | null;
  mimeType: string | null;
  createdAt: string;
  uploadedBy: { firstName: string; lastName: string } | null;
  event: { id: number; title: string } | null;
  versions: DocVersion[];
  _count?: { versions: number };
}

interface EventOption {
  id: number;
  title: string;
}

interface LeadDocumentsTabProps {
  leadId: number;
  canManage: boolean;
}

function isImage(mimeType: string | null) {
  return !!mimeType && mimeType.startsWith('image/');
}
function isPdf(mimeType: string | null) {
  return mimeType === 'application/pdf';
}

async function fetchLeadDocuments(leadId: number): Promise<LeadDocumentRecord[]> {
  const res = await fetch(`/api/leads/${leadId}/documents`);
  if (!res.ok) throw new Error('Failed to load documents');
  return res.json();
}

async function fetchEvents(leadId: number): Promise<EventOption[]> {
  const res = await fetch(`/api/leads/${leadId}/events`);
  if (!res.ok) return [];
  return res.json();
}

export default function LeadDocumentsTab({ leadId, canManage }: LeadDocumentsTabProps) {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [uploadEventId, setUploadEventId] = useState<string>('');

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['lead-documents', leadId],
    queryFn: () => fetchLeadDocuments(leadId),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events', leadId],
    queryFn: () => fetchEvents(leadId),
  });

  const expandedDoc = documents.find((d) => d.id === expandedId) || null;
  const { data: historyDoc } = useQuery({
    queryKey: ['document-detail', leadId, expandedId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/events/${expandedDoc!.eventId}/documents/${expandedId}`);
      if (!res.ok) throw new Error('Failed to load version history');
      return res.json() as Promise<{ versions: DocVersion[] }>;
    },
    enabled: expandedId !== null && !!expandedDoc?.eventId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-documents', leadId] });
    queryClient.invalidateQueries({ queryKey: ['event-documents'] });
    queryClient.invalidateQueries({ queryKey: ['lead-activities', leadId] });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!uploadEventId) throw new Error('Choose which event this document belongs to');
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/leads/${leadId}/events/${uploadEventId}/documents`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast.success('Document uploaded!'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const replaceMutation = useMutation({
    mutationFn: async ({ eventId, documentId, file }: { eventId: number; documentId: number; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/leads/${leadId}/events/${eventId}/documents/${documentId}/versions`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to upload new version');
      }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast.success('New version uploaded!'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ eventId, documentId }: { eventId: number; documentId: number }) => {
      const res = await fetch(`/api/leads/${leadId}/events/${eventId}/documents/${documentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete document');
    },
    onSuccess: () => { invalidateAll(); toast.success('Document deleted'); },
    onError: () => toast.error('Failed to delete document'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-800">Documents</h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <select value={uploadEventId} onChange={(e) => setUploadEventId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-800 focus:ring-2 focus:ring-amber-500">
              <option value="">Select event...</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
            <DocumentUpload label="Upload Document" onFileSelected={(file) => uploadMutation.mutate(file)} disabled={uploadMutation.isPending || !uploadEventId} />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500 mx-auto" /></div>
      ) : documents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <FolderOpenIcon className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-4 text-slate-600 font-medium">No documents uploaded yet</p>
          {canManage && events.length === 0 && <p className="text-sm text-slate-400 mt-1">Create an event first, then you can attach documents to it</p>}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 divide-y divide-slate-100">
          {documents.map((doc) => {
            const latest = doc.versions[0];
            const versionCount = doc._count?.versions ?? doc.versions.length;
            const expanded = expandedId === doc.id;
            return (
              <div key={doc.id} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isImage(doc.mimeType) ? <PhotoIcon className="h-5 w-5 text-slate-400 flex-shrink-0" /> : <DocumentIcon className="h-5 w-5 text-slate-400 flex-shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{doc.fileName}</p>
                      <p className="text-xs text-slate-500">
                        v{latest?.versionNumber ?? 1} · {doc.uploadedBy ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}` : 'Unknown'} · {dayjs(doc.createdAt).format('DD MMM YYYY, HH:mm')}
                        {doc.event && <> · <span className="text-slate-400">{doc.event.title}</span></>}
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
                    {canManage && doc.eventId && (
                      <label className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer" title="Replace with newer version">
                        <ArrowUpTrayIcon className="h-4 w-4" />
                        <input type="file" className="hidden" onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) replaceMutation.mutate({ eventId: doc.eventId!, documentId: doc.id, file });
                        }} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*" />
                      </label>
                    )}
                    {canManage && doc.eventId && (
                      <button onClick={() => { if (window.confirm(`Delete "${doc.fileName}"?`)) deleteMutation.mutate({ eventId: doc.eventId!, documentId: doc.id }); }} className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {doc.description && <p className="text-xs text-slate-500 mt-2">{doc.description}</p>}
                {expanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 uppercase">Version History</p>
                    {!historyDoc && <p className="text-xs text-slate-400">Loading...</p>}
                    {(historyDoc?.versions || doc.versions).map((v) => (
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
