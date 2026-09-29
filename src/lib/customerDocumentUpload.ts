import { putEncrypted } from '@/lib/storage';

// Customer Documents (KYC / NDA & Contract) — a standalone copy of
// src/lib/eventDocumentUpload.ts's validate/upload pair rather than a
// shared import, so this feature never depends on Lead Events' own code.
// Validators live in the client-safe customerDocumentValidation.ts (client
// components import them from there, since this file pulls in
// storage/crypto); re-exported here so server callers keep a single import.
export { MAX_CUSTOMER_DOCUMENT_SIZE, ALLOWED_CUSTOMER_DOCUMENT_MIME_TYPES, validateCustomerDocumentFile } from '@/lib/customerDocumentValidation';

// Encrypted before upload (see putEncrypted / documentEncryption.ts) — the
// stored object is ciphertext and is only readable through the Customer
// document ".../file" endpoints, which decrypt it server-side.
export async function uploadCustomerDocumentBlob(file: File, pathPrefix: string) {
  return putEncrypted(pathPrefix, file);
}

export function fileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}
