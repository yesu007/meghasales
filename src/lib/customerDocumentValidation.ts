// Client-safe: no storage/crypto imports, so upload forms can validate files
// in the browser. customerDocumentUpload.ts re-exports these for server code.

// Business requirement scopes Customer Document uploads to PDF/DOC/DOCX/JPG/PNG
// only (narrower than the Lead Events allow-list, which also takes
// spreadsheets/slides/zips) — same 10MB cap for consistency with the rest
// of the app.
export const MAX_CUSTOMER_DOCUMENT_SIZE = 10 * 1024 * 1024;

export const ALLOWED_CUSTOMER_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'image/jpeg',
  'image/png',
];

export function validateCustomerDocumentFile(file: { size: number; type?: string }): string | null {
  if (file.size > MAX_CUSTOMER_DOCUMENT_SIZE) return 'File exceeds the 10MB limit';
  if (file.type && !ALLOWED_CUSTOMER_DOCUMENT_MIME_TYPES.includes(file.type)) {
    return 'Unsupported file type — allowed: PDF, DOC/DOCX, JPG, PNG';
  }
  return null;
}
