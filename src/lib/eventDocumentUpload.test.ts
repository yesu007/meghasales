import { describe, it, expect } from 'vitest';
import { validateEventDocumentFile, MAX_EVENT_DOCUMENT_SIZE } from './eventDocumentUpload';

describe('validateEventDocumentFile', () => {
  it('rejects a file over the 10MB limit', () => {
    expect(
      validateEventDocumentFile({ size: MAX_EVENT_DOCUMENT_SIZE + 1, type: 'application/pdf' })
    ).toMatch(/10MB/);
  });

  it('accepts a file exactly at the limit', () => {
    expect(
      validateEventDocumentFile({ size: MAX_EVENT_DOCUMENT_SIZE, type: 'application/pdf' })
    ).toBeNull();
  });

  it('rejects a disallowed MIME type', () => {
    expect(
      validateEventDocumentFile({ size: 1000, type: 'application/x-msdownload' })
    ).toMatch(/unsupported file type/i);
  });

  it('accepts each allowed document/image/archive type', () => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'image/png',
      'image/jpeg',
    ];
    for (const type of allowed) {
      expect(validateEventDocumentFile({ size: 1000, type })).toBeNull();
    }
  });

  it('accepts a file with no reported type (browser sometimes omits it)', () => {
    expect(validateEventDocumentFile({ size: 1000, type: '' })).toBeNull();
  });
});
