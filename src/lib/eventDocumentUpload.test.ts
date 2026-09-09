import { describe, it, expect, afterEach } from 'vitest';
import { validateEventDocumentFile, isBlobConfigured, MAX_EVENT_DOCUMENT_SIZE } from './eventDocumentUpload';

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

describe('isBlobConfigured', () => {
  const ORIGINAL = process.env.BLOB_READ_WRITE_TOKEN;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL;
  });

  it('is false when unset', () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(isBlobConfigured()).toBe(false);
  });

  it('is false when blank', () => {
    process.env.BLOB_READ_WRITE_TOKEN = '';
    expect(isBlobConfigured()).toBe(false);
  });

  // Regression test for the "Vercel Blob: Access denied" bug — .env.example
  // used to ship this exact placeholder, which is truthy and used to pass a
  // bare `if (!token)` guard, letting put() fail raw instead of the
  // intended clean 503.
  it('is false for the .env.example placeholder value', () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel-blob-store-token';
    expect(isBlobConfigured()).toBe(false);
  });

  it('is true for a real-shaped Vercel Blob RW token', () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_abc123_def456';
    expect(isBlobConfigured()).toBe(true);
  });
});
