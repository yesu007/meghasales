import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Envelope encryption for uploaded documents (Customer KYC/Contracts, Lead
// documents, Employee documents / My Documents) — every file is encrypted
// here before it leaves the server, so the object stored in S3 (or Vercel
// Blob) is never the readable original.
//
//   plaintext --AES-256-GCM(DEK, random IV)--> ciphertext
//   DEK       --KeyProvider.wrap (master key)--> wrapped DEK
//
// Each file gets its own random 256-bit data key (DEK) and its own random
// 96-bit IV, so no (key, IV) pair is ever reused. Only the *wrapped* DEK is
// stored — inside the object's own header below — never the master key and
// never a plain DEK. The master key comes from a KeyProvider: today an
// environment variable, later a KMS/Secrets Manager-backed provider can be
// dropped in without changing the stored format (the header records which
// key id wrapped each file, and the wrapped-key field is variable-length to
// fit a KMS ciphertext blob).
//
// Object layout (all integers big-endian):
//   magic "MSDOCENC" (8) | version (1) | keyIdLen (1) | keyId (keyIdLen)
//   | wrappedKeyLen (2) | wrappedKey (wrappedKeyLen) | iv (12)
//   | authTag (16) | ciphertext
// Everything before authTag is bound as GCM additional authenticated data,
// so tampering with the header (key id, wrapped key, IV) fails decryption
// exactly like tampering with the ciphertext does.

const MAGIC = Buffer.from('MSDOCENC', 'ascii');
const FORMAT_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export const ENCRYPTED_CONTENT_TYPE = 'application/octet-stream';

export class DocumentEncryptionError extends Error {}

export interface KeyProvider {
  currentKeyId(): string;
  wrapKey(dek: Buffer): Promise<{ keyId: string; wrappedKey: Buffer }>;
  unwrapKey(keyId: string, wrappedKey: Buffer): Promise<Buffer>;
}

function parseKey(raw: string, name: string): Buffer {
  const value = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new DocumentEncryptionError(`${name} must be a 256-bit key (32 bytes, base64- or hex-encoded)`);
  }
  return key;
}

// Master key(s) from the environment — for local development and until a
// KMS-backed provider replaces it:
//   DOCUMENT_ENCRYPTION_KEY          current master key (base64 or hex, 32 bytes)
//   DOCUMENT_ENCRYPTION_KEY_ID       its id, recorded in each file header (default "env-v1")
//   DOCUMENT_ENCRYPTION_PREVIOUS_KEYS  optional "id:key,id:key" list of retired
//                                    master keys still needed to read older files
//                                    after a rotation
// The DEK is wrapped with AES-256-GCM too: wrappedKey = iv(12) | tag(16) | ciphertext(32).
class EnvKeyProvider implements KeyProvider {
  private keys = new Map<string, Buffer>();
  private keyId: string;

  constructor() {
    const current = process.env.DOCUMENT_ENCRYPTION_KEY;
    if (!current) throw new DocumentEncryptionError('Document encryption is not configured — set DOCUMENT_ENCRYPTION_KEY');
    this.keyId = (process.env.DOCUMENT_ENCRYPTION_KEY_ID || 'env-v1').trim();
    if (!this.keyId || Buffer.byteLength(this.keyId) > 255) throw new DocumentEncryptionError('DOCUMENT_ENCRYPTION_KEY_ID must be 1–255 bytes');
    this.keys.set(this.keyId, parseKey(current, 'DOCUMENT_ENCRYPTION_KEY'));

    for (const entry of (process.env.DOCUMENT_ENCRYPTION_PREVIOUS_KEYS || '').split(',')) {
      const sep = entry.indexOf(':');
      if (sep <= 0) continue;
      const id = entry.slice(0, sep).trim();
      if (!this.keys.has(id)) this.keys.set(id, parseKey(entry.slice(sep + 1), `DOCUMENT_ENCRYPTION_PREVIOUS_KEYS (${id})`));
    }
  }

  currentKeyId(): string {
    return this.keyId;
  }

  async wrapKey(dek: Buffer) {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.keyId)!, iv);
    cipher.setAAD(Buffer.from(this.keyId, 'utf8'));
    const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
    return { keyId: this.keyId, wrappedKey: Buffer.concat([iv, cipher.getAuthTag(), wrapped]) };
  }

  async unwrapKey(keyId: string, wrappedKey: Buffer) {
    const master = this.keys.get(keyId);
    if (!master) throw new DocumentEncryptionError(`No master key configured for key id "${keyId}"`);
    if (wrappedKey.length !== IV_LENGTH + TAG_LENGTH + KEY_LENGTH) throw new DocumentEncryptionError('Malformed wrapped key');
    const decipher = createDecipheriv('aes-256-gcm', master, wrappedKey.subarray(0, IV_LENGTH));
    decipher.setAAD(Buffer.from(keyId, 'utf8'));
    decipher.setAuthTag(wrappedKey.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
    return Buffer.concat([decipher.update(wrappedKey.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]);
  }
}

let providerOverride: KeyProvider | null = null;
let envProvider: EnvKeyProvider | null = null;

// Swap point for a KMS/Secrets Manager-backed provider (and for tests).
export function setKeyProvider(provider: KeyProvider | null) {
  providerOverride = provider;
  envProvider = null;
}

function getKeyProvider(): KeyProvider {
  if (providerOverride) return providerOverride;
  if (!envProvider) envProvider = new EnvKeyProvider();
  return envProvider;
}

export function isDocumentEncryptionConfigured(): boolean {
  try {
    getKeyProvider();
    return true;
  } catch {
    return false;
  }
}

export function isEncryptedDocument(data: Buffer): boolean {
  return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}

export async function encryptDocument(plaintext: Buffer): Promise<Buffer> {
  const provider = getKeyProvider();
  const dek = randomBytes(KEY_LENGTH);
  try {
    const { keyId, wrappedKey } = await provider.wrapKey(dek);
    const keyIdBytes = Buffer.from(keyId, 'utf8');
    if (keyIdBytes.length > 255 || wrappedKey.length > 0xffff) throw new DocumentEncryptionError('Key id or wrapped key too long');

    const iv = randomBytes(IV_LENGTH);
    const header = Buffer.concat([
      MAGIC,
      Buffer.from([FORMAT_VERSION, keyIdBytes.length]),
      keyIdBytes,
      Buffer.from([wrappedKey.length >> 8, wrappedKey.length & 0xff]),
      wrappedKey,
      iv,
    ]);

    const cipher = createCipheriv('aes-256-gcm', dek, iv);
    cipher.setAAD(header);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([header, cipher.getAuthTag(), ciphertext]);
  } finally {
    dek.fill(0);
  }
}

export async function decryptDocument(data: Buffer): Promise<Buffer> {
  if (!isEncryptedDocument(data)) throw new DocumentEncryptionError('Not an encrypted document');
  let offset = MAGIC.length;
  const need = (n: number) => {
    if (offset + n > data.length) throw new DocumentEncryptionError('Encrypted document is truncated');
  };

  need(2);
  const version = data[offset];
  const keyIdLen = data[offset + 1];
  offset += 2;
  if (version !== FORMAT_VERSION) throw new DocumentEncryptionError(`Unsupported encrypted document version ${version}`);

  need(keyIdLen + 2);
  const keyId = data.subarray(offset, offset + keyIdLen).toString('utf8');
  offset += keyIdLen;
  const wrappedLen = (data[offset] << 8) | data[offset + 1];
  offset += 2;

  need(wrappedLen + IV_LENGTH + TAG_LENGTH);
  const wrappedKey = data.subarray(offset, offset + wrappedLen);
  offset += wrappedLen;
  const iv = data.subarray(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const header = data.subarray(0, offset);
  const tag = data.subarray(offset, offset + TAG_LENGTH);
  offset += TAG_LENGTH;

  const dek = await getKeyProvider().unwrapKey(keyId, wrappedKey);
  try {
    const decipher = createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data.subarray(offset)), decipher.final()]);
  } catch {
    throw new DocumentEncryptionError('Encrypted document failed integrity check');
  } finally {
    dek.fill(0);
  }
}
