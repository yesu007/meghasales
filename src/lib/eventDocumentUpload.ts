import { put } from '@vercel/blob';

// Requirement documents on Lead Events — PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX/images/ZIP.
// Same 10MB cap as the accounting payment-attachment upload for consistency.
export const MAX_EVENT_DOCUMENT_SIZE = 10 * 1024 * 1024;

export const ALLOWED_EVENT_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

export function validateEventDocumentFile(file: { size: number; type?: string }): string | null {
  if (file.size > MAX_EVENT_DOCUMENT_SIZE) return 'File exceeds the 10MB limit';
  if (file.type && !ALLOWED_EVENT_DOCUMENT_MIME_TYPES.includes(file.type)) {
    return 'Unsupported file type — allowed: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, images, ZIP';
  }
  return null;
}

export async function uploadEventDocumentBlob(file: File, pathPrefix: string) {
  return put(`${pathPrefix}/${Date.now()}-${file.name}`, file, { access: 'public' });
}

// .env.example ships BLOB_READ_WRITE_TOKEN as a literal placeholder string
// ("vercel-blob-store-token") rather than leaving it unset — copying that
// file verbatim into .env leaves the var *truthy* but not a real token, so
// a bare `if (!process.env.BLOB_READ_WRITE_TOKEN)` guard (the pattern every
// upload route used) never catches it: put() is called anyway and fails
// with Vercel Blob's raw "Access denied, please provide a valid token"
// error instead of the intended clean 503. Real Vercel Blob RW tokens are
// always prefixed `vercel_blob_rw_` — check that shape too, not just
// presence, so a placeholder/garbage value is caught before ever reaching
// put().
export function isBlobConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return !!token && token.startsWith('vercel_blob_rw_');
}
