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
