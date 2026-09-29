import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptDocument, decryptDocument, isEncryptedDocument, isDocumentEncryptionConfigured, setKeyProvider } from './documentEncryption';

const ENV_KEYS = ['DOCUMENT_ENCRYPTION_KEY', 'DOCUMENT_ENCRYPTION_KEY_ID', 'DOCUMENT_ENCRYPTION_PREVIOUS_KEYS'] as const;
const saved: Record<string, string | undefined> = {};

function useKey(key: Buffer, id?: string, previous?: string) {
  process.env.DOCUMENT_ENCRYPTION_KEY = key.toString('base64');
  if (id) process.env.DOCUMENT_ENCRYPTION_KEY_ID = id;
  else delete process.env.DOCUMENT_ENCRYPTION_KEY_ID;
  if (previous) process.env.DOCUMENT_ENCRYPTION_PREVIOUS_KEYS = previous;
  else delete process.env.DOCUMENT_ENCRYPTION_PREVIOUS_KEYS;
  setKeyProvider(null); // drop the cached provider so the new env is read
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  useKey(randomBytes(32));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  setKeyProvider(null);
});

describe('documentEncryption', () => {
  const original = Buffer.from('%PDF-1.7 confidential customer contract contents');

  it('round-trips a document and never stores the plaintext', async () => {
    const encrypted = await encryptDocument(original);
    expect(isEncryptedDocument(encrypted)).toBe(true);
    expect(encrypted.includes(original)).toBe(false);
    expect(encrypted.includes(Buffer.from('confidential'))).toBe(false);
    expect((await decryptDocument(encrypted)).equals(original)).toBe(true);
  });

  it('uses a fresh IV and data key for every file', async () => {
    const a = await encryptDocument(original);
    const b = await encryptDocument(original);
    expect(a.equals(b)).toBe(false);
    // Same length header, so the IV sits at the same offset in both.
    const ivOffset = a.length - original.length - 16 - 12;
    expect(a.subarray(ivOffset, ivOffset + 12).equals(b.subarray(ivOffset, ivOffset + 12))).toBe(false);
  });

  it('rejects a tampered ciphertext', async () => {
    const encrypted = await encryptDocument(original);
    encrypted[encrypted.length - 1] ^= 0x01;
    await expect(decryptDocument(encrypted)).rejects.toThrow();
  });

  it('rejects a tampered header (authenticated as AAD)', async () => {
    const encrypted = await encryptDocument(original);
    const ivOffset = encrypted.length - original.length - 16 - 12;
    encrypted[ivOffset] ^= 0x01;
    await expect(decryptDocument(encrypted)).rejects.toThrow();
  });

  it('cannot be decrypted with a different master key', async () => {
    const encrypted = await encryptDocument(original);
    useKey(randomBytes(32));
    await expect(decryptDocument(encrypted)).rejects.toThrow();
  });

  it('still decrypts files wrapped by a rotated-out key listed in DOCUMENT_ENCRYPTION_PREVIOUS_KEYS', async () => {
    const oldKey = randomBytes(32);
    useKey(oldKey, 'k1');
    const encrypted = await encryptDocument(original);

    useKey(randomBytes(32), 'k2', `k1:${oldKey.toString('base64')}`);
    expect((await decryptDocument(encrypted)).equals(original)).toBe(true);
  });

  it('accepts a hex-encoded key', async () => {
    process.env.DOCUMENT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    setKeyProvider(null);
    expect((await decryptDocument(await encryptDocument(original))).equals(original)).toBe(true);
  });

  it('refuses to encrypt when no key is configured, and rejects short keys', async () => {
    delete process.env.DOCUMENT_ENCRYPTION_KEY;
    setKeyProvider(null);
    expect(isDocumentEncryptionConfigured()).toBe(false);
    await expect(encryptDocument(original)).rejects.toThrow(/not configured/);

    process.env.DOCUMENT_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    setKeyProvider(null);
    await expect(encryptDocument(original)).rejects.toThrow(/256-bit/);
  });

  it('treats legacy plain uploads as not encrypted', () => {
    expect(isEncryptedDocument(original)).toBe(false);
    expect(isEncryptedDocument(Buffer.alloc(0))).toBe(false);
  });
});
