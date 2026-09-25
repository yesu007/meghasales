'use client';

// A popup preview for a reimbursement's uploaded receipt — used from
// Reimbursements Approvals instead of navigating away via a plain <a
// target="_blank">. Supports the same file types the upload route itself
// already allows (see validateEventDocumentFile in eventDocumentUpload.ts):
// images and PDFs render inline, DOCX is rendered in-page by docx-preview
// (loaded only when needed); anything else (DOC/XLS/PPT/ZIP) falls back to
// a direct download link, since a browser can't preview those inline.
// Never touches the upload flow itself — read-only.

import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, ArrowDownTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];

function extensionOf(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export default function ReceiptViewerModal({ url, name, onClose }: { url: string; name: string | null; onClose: () => void }) {
  const ext = extensionOf(name || url);
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  const isPdf = ext === 'pdf';
  const isDocx = ext === 'docx';
  // Downloads force an attachment (the file route opens PDFs/images inline otherwise).
  const downloadUrl = url.startsWith('/api/') ? `${url}${url.includes('?') ? '&' : '?'}download=1` : url;

  // DOCX preview: fetch the (server-decrypted) file and render it into the
  // container. Falls back to the download prompt if it can't be rendered.
  const docxRef = useRef<HTMLDivElement>(null);
  const [docxState, setDocxState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (!isDocx) return;
    let cancelled = false;
    setDocxState('loading');
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const { renderAsync } = await import('docx-preview');
        if (cancelled || !docxRef.current) return;
        docxRef.current.innerHTML = '';
        await renderAsync(data, docxRef.current, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true });
        if (!cancelled) setDocxState('ready');
      } catch (err) {
        console.error('DOCX preview failed:', err);
        if (!cancelled) setDocxState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [isDocx, url]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-800">Receipt</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{name || 'Attachment'}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={downloadUrl} target="_blank" rel="noreferrer" className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Download">
              <ArrowDownTrayIcon className="h-5 w-5" />
            </a>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><XMarkIcon className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-50">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name || 'Receipt'} className="max-w-full max-h-[65vh] rounded-lg shadow-sm object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={name || 'Receipt'} className="w-full h-[65vh] rounded-lg border border-slate-200 bg-white" />
          ) : isDocx && docxState !== 'error' ? (
            // Outer box clips to the rounded corners; only the inner box
            // scrolls, so its scrollbars never square off the corners.
            <div className="w-full h-[60vh] rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="h-full overflow-auto">
                {docxState === 'loading' && <p className="py-10 text-center text-sm text-slate-400">Loading preview…</p>}
                <div ref={docxRef} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <DocumentIcon className="h-12 w-12 text-slate-300" />
              <p className="text-sm text-slate-500">Preview isn&apos;t available for this file type.</p>
              <a href={downloadUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">
                <ArrowDownTrayIcon className="h-4 w-4" /> Download {name || 'file'}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
