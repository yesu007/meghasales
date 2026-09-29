import { put, putEncrypted, isBlobConfigured, isStorageConfigured } from '@/lib/storage';

export { isBlobConfigured, isStorageConfigured };

// Validators live in a client-safe module (client components import them
// from there, since this file pulls in storage/crypto); re-exported here so
// server callers keep a single import.
export { MAX_EVENT_DOCUMENT_SIZE, ALLOWED_EVENT_DOCUMENT_MIME_TYPES, validateEventDocumentFile } from '@/lib/eventDocumentValidation';

export async function uploadEventDocumentBlob(file: File, pathPrefix: string) {
  return put(`${pathPrefix}/${Date.now()}-${file.name}`, file, { access: 'public' });
}

// Encrypted variant for Lead documents and Lead Event/discussion documents
// (see putEncrypted / documentEncryption.ts) — read back only through the
// Lead document ".../file" endpoints, which decrypt server-side. The plain
// uploadEventDocumentBlob above stays as-is for its other callers (company
// legal entity documents, expense claim receipts).
export async function uploadEncryptedEventDocumentBlob(file: File, pathPrefix: string) {
  return putEncrypted(pathPrefix, file);
}
