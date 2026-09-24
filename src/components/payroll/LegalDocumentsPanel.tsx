'use client';

// Reused by both Employee Details (Employee → Legal Documents — the same
// page also serves as "Payroll Employee") and My Space → My Documents.
// Which one a given page gets is entirely down to the `apiBase`/`canUpload`/
// `canDelete` props — the component itself has no idea whether it's
// looking at "my own" documents or an admin's view of someone else's.
//
// Folder tree: a document optionally sits inside an EmployeeDocumentFolder
// (see that model's own schema comment) — folders are pure organization
// with none of the compliance weight of the documents themselves, so
// creating/deleting/moving into one is gated by the same canUpload flag
// as a file upload, not the stricter canDelete a real document needs.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DocumentIcon, PhotoIcon, TrashIcon, EyeIcon, ArrowDownTrayIcon, PaperClipIcon,
  ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, FolderIcon, FolderPlusIcon,
  HomeIcon, ArrowRightCircleIcon, CloudArrowUpIcon, XMarkIcon, PencilIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import { validateEventDocumentFile } from '@/lib/eventDocumentUpload';

// Free-text pseudo-enum, same convention as Employee.employmentType — see
// EmployeeLegalDocument's schema comment. Every upload now goes through
// drag-and-drop (tagged DEFAULT_DROPPED_DOCUMENT_TYPE below) rather than a
// form with its own type picker, but this list is still what drives each
// document row's own type badge.
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
// What every upload gets tagged as — there's no form/type prompt at
// upload time, matching the reference UI's frictionless drop-to-upload;
// organize by folder instead of by type.
const DEFAULT_DROPPED_DOCUMENT_TYPE = 'OTHER';

interface Folder { id: number; parentId: number | null; name: string }
interface LegalDocument {
  id: number;
  documentType: string;
  documentName: string;
  filePath: string;
  mimeType: string | null;
  size: number | null;
  folderId: number | null;
  createdAt: string;
  uploadedByName: string | null;
}
interface FolderNode extends Folder {
  children: FolderNode[];
  documents: LegalDocument[];
}

interface LegalDocumentsPanelProps {
  apiBase: string; // e.g. `/api/payroll/employees/${id}/documents` or `/api/payroll/my-documents`
  queryKey: string; // distinct react-query cache key per mount context
  canUpload: boolean;
  canDelete: boolean;
  // my-documents' GET returns { employee, folders, documents }; the
  // employee-module GET returns { folders, documents } directly — this
  // normalizes both into one shape so the component doesn't need two code
  // paths.
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

async function fetchTree(apiBase: string, responseHasWrapper: boolean): Promise<{ folders: Folder[]; documents: LegalDocument[] }> {
  const res = await fetch(apiBase);
  if (!res.ok) throw new Error('Failed to load documents');
  const data = await res.json();
  return responseHasWrapper ? { folders: data.folders ?? [], documents: data.documents ?? [] } : { folders: data.folders ?? [], documents: data.documents ?? [] };
}

// Flat lists in, nested tree out — same "adjacency list, build client-side"
// shape the API deliberately keeps simple (see documentTreeForEmployee).
function buildTree(folders: Folder[], documents: LegalDocument[]): { roots: FolderNode[]; rootDocuments: LegalDocument[] } {
  const byId = new Map<number, FolderNode>(folders.map((f) => [f.id, { ...f, children: [], documents: [] }]));
  const roots: FolderNode[] = [];
  for (const node of Array.from(byId.values())) {
    if (node.parentId != null && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const rootDocuments: LegalDocument[] = [];
  for (const doc of documents) {
    if (doc.folderId != null && byId.has(doc.folderId)) byId.get(doc.folderId)!.documents.push(doc);
    else rootDocuments.push(doc);
  }
  return { roots, rootDocuments };
}

// Flattened (folder, depth) pairs, Root first — for the Move-to-folder
// picker and the New Folder location breadcrumb, where a nested tree
// widget would be overkill.
function flattenFolders(nodes: FolderNode[], depth = 0): Array<{ id: number; name: string; depth: number }> {
  const out: Array<{ id: number; name: string; depth: number }> = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    out.push(...flattenFolders(n.children, depth + 1));
  }
  return out;
}

// A folder's own id plus every descendant's — for the Move-folder picker,
// which must exclude all of these (moving a folder into itself or its own
// subfolder would create an unreachable cycle; the server checks this too,
// this is just so the picker doesn't even offer the invalid choice).
function collectSelfAndDescendantIds(node: FolderNode): Set<number> {
  const ids = new Set<number>([node.id]);
  for (const child of node.children) {
    for (const id of Array.from(collectSelfAndDescendantIds(child))) ids.add(id);
  }
  return ids;
}

export default function LegalDocumentsPanel({ apiBase, queryKey, canUpload, canDelete, responseHasWrapper = false }: LegalDocumentsPanelProps) {
  const queryClient = useQueryClient();
  const [panelOpen, setPanelOpen] = useState(true);

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [newFolderParentId, setNewFolderParentId] = useState<number | null | undefined>(undefined); // undefined = input hidden
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [moveTarget, setMoveTarget] = useState<LegalDocument | null>(null);
  const [moveFolderTarget, setMoveFolderTarget] = useState<FolderNode | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => fetchTree(apiBase, responseHasWrapper),
  });
  const documents = useMemo(() => data?.documents ?? [], [data]);
  const { roots, rootDocuments } = useMemo(
    () => buildTree(data?.folders ?? [], documents),
    [data, documents],
  );
  const flatFolders = useMemo(() => flattenFolders(roots), [roots]);

  const toggleExpand = (id: number) => setExpanded((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const uploadFile = async (file: File, folderId: number | null, type: string) => {
    const error = validateEventDocumentFile(file);
    if (error) { toast.error(error); return false; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('documentType', type);
    if (folderId != null) fd.append('folderId', String(folderId));
    const res = await fetch(apiBase, { method: 'POST', body: fd });
    if (!res.ok) { const err = await res.json(); toast.error(err.message || 'Upload failed'); return false; }
    return true;
  };

  // Drag-and-drop / drop-zone browse, and each folder row's own upload
  // icon — no form, uploads straight into `folderId` (root when null),
  // tagged OTHER. The drop zone passes whichever folder is currently
  // selected; a folder row's icon passes that row's own id directly, so
  // uploading there doesn't require selecting it first.
  const dropUploadMutation = useMutation({
    mutationFn: async ({ files, folderId }: { files: File[]; folderId: number | null }) => {
      let uploaded = 0;
      for (const file of files) {
        const ok = await uploadFile(file, folderId, DEFAULT_DROPPED_DOCUMENT_TYPE);
        if (ok) uploaded += 1;
      }
      return uploaded;
    },
    onSuccess: (uploaded: number) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      if (uploaded > 0) toast.success(`${uploaded} file${uploaded > 1 ? 's' : ''} uploaded`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await fetch(`${apiBase}/${documentId}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.message || 'Failed to delete document'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); toast.success('Document deleted'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ documentId, folderId }: { documentId: number; folderId: number | null }) => {
      const res = await fetch(`${apiBase}/${documentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderId }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to move document'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); toast.success('Document moved'); setMoveTarget(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const createFolderMutation = useMutation({
    mutationFn: async ({ parentId, path }: { parentId: number | null; path: string }) => {
      const res = await fetch(`${apiBase}/folders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId, path }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to create folder'); }
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Folder created');
      setNewFolderParentId(undefined);
      setNewFolderName('');
      if (result.folderId) setExpanded((s) => new Set(s).add(result.folderId));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: number) => {
      const res = await fetch(`${apiBase}/folders/${folderId}`, { method: 'DELETE' });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to delete folder'); }
    },
    onSuccess: (_r, folderId) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success('Folder deleted');
      if (selectedFolderId === folderId) setSelectedFolderId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: number; name: string }) => {
      const res = await fetch(`${apiBase}/folders/${folderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to rename folder'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); toast.success('Folder renamed'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const moveFolderMutation = useMutation({
    mutationFn: async ({ folderId, parentId }: { folderId: number; parentId: number | null }) => {
      const res = await fetch(`${apiBase}/folders/${folderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId }) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || 'Failed to move folder'); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [queryKey] }); toast.success('Folder moved'); setMoveFolderTarget(null); },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) dropUploadMutation.mutate({ files, folderId: selectedFolderId });
  };

  const totalFiles = documents.length;
  const selectedFolderName = selectedFolderId != null ? flatFolders.find((f) => f.id === selectedFolderId)?.name : 'ROOT';

  const renderDocumentRow = (doc: LegalDocument, depth: number) => (
    <div key={doc.id} className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50 rounded-lg" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
      <div className="flex items-center gap-2 min-w-0">
        {isImage(doc.mimeType) ? <PhotoIcon className="h-5 w-5 text-slate-400 flex-shrink-0" /> : <DocumentIcon className="h-5 w-5 text-rose-400 flex-shrink-0" />}
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
        {canUpload && (
          <button onClick={() => setMoveTarget(doc)} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50" title="Move to folder">
            <ArrowRightCircleIcon className="h-4 w-4" />
          </button>
        )}
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
  );

  const renderFolderNode = (node: FolderNode, depth: number): React.ReactNode => {
    const isOpen = expanded.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const totalCount = node.children.length + node.documents.length;
    const summary = totalCount === 0 ? 'Empty' : node.children.length > 0 && node.documents.length > 0
      ? `${node.children.length} folder${node.children.length > 1 ? 's' : ''}, ${node.documents.length} file${node.documents.length > 1 ? 's' : ''}`
      : node.children.length > 0 ? `${node.children.length} folder${node.children.length > 1 ? 's' : ''}` : `${node.documents.length} file${node.documents.length > 1 ? 's' : ''}`;

    return (
      <div key={node.id}>
        <div
          onClick={() => { toggleExpand(node.id); setSelectedFolderId(node.id); }}
          className={`flex items-center justify-between gap-2 py-2 rounded-lg cursor-pointer ${isSelected ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {isOpen ? <ChevronDownIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" /> : <ChevronRightIcon className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
            <FolderIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-700 truncate">{node.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 pr-2">
            <span className="text-xs text-slate-400">{summary}</span>
            {canUpload && (
              <button
                onClick={(e) => { e.stopPropagation(); setNewFolderParentId(node.id); setNewFolderName(''); setExpanded((s) => new Set(s).add(node.id)); }}
                className="p-1 rounded text-slate-300 hover:text-emerald-600 hover:bg-emerald-50"
                title={`New folder inside ${node.name}`}
              >
                <FolderPlusIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {canUpload && (
              <label
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-slate-300 hover:text-amber-600 hover:bg-amber-50 cursor-pointer"
                title={`Upload into ${node.name}`}
              >
                <CloudArrowUpIcon className="h-3.5 w-3.5" />
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    if (files.length > 0) dropUploadMutation.mutate({ files, folderId: node.id });
                  }}
                />
              </label>
            )}
            {canUpload && (
              <button
                onClick={(e) => { e.stopPropagation(); setMoveFolderTarget(node); }}
                className="p-1 rounded text-slate-300 hover:text-amber-600 hover:bg-amber-50"
                title="Move folder"
              >
                <ArrowRightCircleIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {canUpload && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const name = window.prompt('Rename folder', node.name);
                  if (name != null && name.trim() && name.trim() !== node.name) renameFolderMutation.mutate({ folderId: node.id, name: name.trim() });
                }}
                className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100"
                title="Rename folder"
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </button>
            )}
            {canUpload && (
              <button
                onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${node.name}"?`)) deleteFolderMutation.mutate(node.id); }}
                className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50"
                title="Delete folder"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {isOpen && (
          <div>
            {node.children.map((child) => renderFolderNode(child, depth + 1))}
            {node.documents.map((doc) => renderDocumentRow(doc, depth + 1))}
            {newFolderParentId === node.id && renderNewFolderInput(depth + 1)}
          </div>
        )}
      </div>
    );
  };

  const renderNewFolderInput = (depth: number) => (
    <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
      <FolderIcon className="h-4 w-4 text-amber-400 flex-shrink-0" />
      <input
        autoFocus
        value={newFolderName}
        onChange={(e) => setNewFolderName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && newFolderName.trim()) createFolderMutation.mutate({ parentId: newFolderParentId ?? null, path: newFolderName.trim() });
          if (e.key === 'Escape') { setNewFolderParentId(undefined); setNewFolderName(''); }
        }}
        onBlur={() => { if (!newFolderName.trim()) setNewFolderParentId(undefined); }}
        placeholder="Folder name, or Master/Sub1/Sub2"
        className="flex-1 px-2 py-1 border border-dashed border-emerald-400 rounded text-sm text-slate-800 bg-emerald-50/40 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      />
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setPanelOpen((v) => !v)} className="flex items-center gap-2">
          <PaperClipIcon className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-800">Legal Documents</h2>
          {totalFiles > 0 && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">{totalFiles}</span>}
          {panelOpen ? <ChevronUpIcon className="h-4 w-4 text-slate-400" /> : <ChevronDownIcon className="h-4 w-4 text-slate-400" />}
        </button>
      </div>

      {panelOpen && (
        <>

          {isLoading ? (
            <p className="text-sm text-slate-400">Loading documents...</p>
          ) : (
            <div>
              <div
                onClick={() => setSelectedFolderId(null)}
                className={`flex items-center gap-1.5 py-2 rounded-lg cursor-pointer text-xs font-medium uppercase tracking-wide ${selectedFolderId === null ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400 hover:bg-slate-50'}`}
                style={{ paddingLeft: '8px' }}
              >
                <HomeIcon className="h-3.5 w-3.5" /> Root
              </div>

              {roots.length === 0 && rootDocuments.length === 0 && newFolderParentId === undefined ? (
                <p className="text-sm text-slate-400 py-2 pl-2">No attachments yet.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {roots.map((node) => renderFolderNode(node, 1))}
                  {rootDocuments.map((doc) => renderDocumentRow(doc, 1))}
                  {newFolderParentId === null && renderNewFolderInput(1)}
                </div>
              )}
            </div>
          )}

          {canUpload && (
            <button
              onClick={() => { setNewFolderParentId(selectedFolderId); setNewFolderName(''); if (selectedFolderId != null) setExpanded((s) => new Set(s).add(selectedFolderId)); }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-emerald-400 hover:text-emerald-700"
            >
              <FolderPlusIcon className="h-4 w-4" /> New folder
            </button>
          )}

          {canUpload && (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center gap-1.5 px-4 py-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${dragOver ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <CloudArrowUpIcon className={`h-6 w-6 ${dragOver ? 'text-emerald-500' : 'text-slate-300'}`} />
              <p className="text-sm font-medium text-slate-700">Drag &amp; drop files here</p>
              <p className="text-xs text-slate-400">or click to browse from your computer — into {selectedFolderName}</p>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (files.length > 0) dropUploadMutation.mutate({ files, folderId: selectedFolderId });
                }}
              />
            </label>
          )}
        </>
      )}

      {moveTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setMoveTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-slate-800 truncate">Move &quot;{moveTarget.documentName}&quot; to...</h3>
              <button onClick={() => setMoveTarget(null)} className="p-1 text-slate-400 hover:text-slate-600"><XMarkIcon className="h-4 w-4" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-3">Choose a destination folder.</p>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
              <button
                onClick={() => moveMutation.mutate({ documentId: moveTarget.id, folderId: null })}
                className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 rounded-lg"
              >
                <HomeIcon className="h-4 w-4 text-slate-400" /> Root
              </button>
              {flatFolders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => moveMutation.mutate({ documentId: moveTarget.id, folderId: f.id })}
                  disabled={f.id === moveTarget.folderId}
                  className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 rounded-lg disabled:opacity-40"
                  style={{ paddingLeft: `${f.depth * 16 + 8}px` }}
                >
                  <FolderIcon className="h-4 w-4 text-amber-500" /> {f.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {moveFolderTarget && (() => {
        const excludedIds = collectSelfAndDescendantIds(moveFolderTarget);
        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setMoveFolderTarget(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-semibold text-slate-800 truncate">Move &quot;{moveFolderTarget.name}&quot; to...</h3>
                <button onClick={() => setMoveFolderTarget(null)} className="p-1 text-slate-400 hover:text-slate-600"><XMarkIcon className="h-4 w-4" /></button>
              </div>
              <p className="text-xs text-slate-400 mb-3">Choose a destination folder. A folder can&apos;t be moved into itself or its own subfolder.</p>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                <button
                  onClick={() => moveFolderMutation.mutate({ folderId: moveFolderTarget.id, parentId: null })}
                  disabled={moveFolderTarget.parentId === null}
                  className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 rounded-lg disabled:opacity-40"
                >
                  <HomeIcon className="h-4 w-4 text-slate-400" /> Root
                </button>
                {flatFolders.filter((f) => !excludedIds.has(f.id)).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => moveFolderMutation.mutate({ folderId: moveFolderTarget.id, parentId: f.id })}
                    disabled={f.id === moveFolderTarget.parentId}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 rounded-lg disabled:opacity-40"
                    style={{ paddingLeft: `${f.depth * 16 + 8}px` }}
                  >
                    <FolderIcon className="h-4 w-4 text-amber-500" /> {f.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
