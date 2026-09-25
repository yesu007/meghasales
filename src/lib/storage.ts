import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { put as blobPut } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { encryptDocument, ENCRYPTED_CONTENT_TYPE } from '@/lib/documentEncryption';

// Same call signature and return shape as the original @vercel/blob `put()`,
// so every call site's usage (`const blob = await put(path, file, {...})`,
// then `blob.url`) is unchanged. What happens inside is different: this
// writes to whichever of S3 / Vercel Blob are configured (both, if both
// are), and picks which one's URL is "the" URL saved to the DB.

interface PutOptions {
  access: 'public';
  contentType?: string;
}

interface PutResult {
  url: string;
  pathname: string;
}

// .env.example ships BLOB_READ_WRITE_TOKEN as a literal placeholder string
// ("vercel-blob-store-token") rather than leaving it unset — copying that
// file verbatim into .env leaves the var *truthy* but not a real token, so
// a bare `if (!process.env.BLOB_READ_WRITE_TOKEN)` guard never catches it.
// Real Vercel Blob RW tokens are always prefixed `vercel_blob_rw_` — check
// that shape too, not just presence.
export function isBlobConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return !!token && token.startsWith('vercel_blob_rw_');
}

// S3_BUCKET_NAME is the original name; AWS_S3_BUCKET_NAME is accepted as
// an alias. Credentials are never read here - the AWS SDK's default
// provider chain picks up AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or an
// IAM role / ~/.aws profile) on its own, so no key ever touches source.
function getS3BucketName(): string | undefined {
  return process.env.S3_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
}

function getS3Region(): string {
  return process.env.AWS_REGION || 'ap-south-1';
}

export function isS3Configured(): boolean {
  return !!getS3BucketName();
}

// The guard every upload route should actually check - either backend
// being configured is enough for uploads to work.
export function isStorageConfigured(): boolean {
  return isBlobConfigured() || isS3Configured();
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: getS3Region(),
      // Fail fast instead of hanging the request on a dead connection.
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 60_000 },
    });
  }
  return s3Client;
}

async function uploadToS3(pathname: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = getS3BucketName()!;
  const region = getS3Region();
  try {
    await getS3Client().send(
      new PutObjectCommand({ Bucket: bucket, Key: pathname, Body: body, ContentType: contentType })
    );
  } catch (err) {
    throw new Error(describeS3Error(err, bucket, region));
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${pathname}`;
}

// Maps AWS SDK errors to a clear, secret-free message. Only the error
// name/code and bucket/region are used - never the credentials or the raw
// request (which carries the signed Authorization header).
function describeS3Error(err: unknown, bucket: string, region: string, op: 'upload' | 'download' = 'upload'): string {
  const e = err as { name?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  const code = e?.name || e?.Code || e?.code || 'UnknownError';
  switch (code) {
    case 'InvalidAccessKeyId':
    case 'SignatureDoesNotMatch':
    case 'CredentialsProviderError':
    case 'ExpiredToken':
    case 'InvalidToken':
      return `S3 credentials are invalid or missing (${code}) - check AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY`;
    case 'AccessDenied':
    case 'AllAccessDisabled':
      return `S3 access denied for bucket "${bucket}" - the IAM user needs ${op === 'upload' ? 's3:PutObject' : 's3:GetObject'} on arn:aws:s3:::${bucket}/*`;
    case 'NoSuchBucket':
      return `S3 bucket "${bucket}" does not exist`;
    case 'PermanentRedirect':
    case 'AuthorizationHeaderMalformed':
    case 'IllegalLocationConstraintException':
      return `S3 bucket "${bucket}" is not in region "${region}" - check AWS_REGION`;
    case 'TimeoutError':
    case 'RequestTimeout':
    case 'RequestTimeTooSkewed':
    case 'ETIMEDOUT':
    case 'ECONNRESET':
      return `S3 ${op} timed out or the connection dropped (${code}) - please retry`;
    default:
      return `S3 ${op} failed (${code}${e?.$metadata?.httpStatusCode ? `, HTTP ${e.$metadata.httpStatusCode}` : ''})`;
  }
}

async function uploadToBlob(pathname: string, file: File | Blob): Promise<string> {
  const result = await blobPut(pathname, file, { access: 'public' });
  return result.url;
}

export async function put(
  pathname: string,
  file: File | Blob,
  options: PutOptions
): Promise<PutResult> {
  const s3Configured = isS3Configured();
  const blobConfigured = isBlobConfigured();

  if (!s3Configured && !blobConfigured) {
    throw new Error(
      'File storage is not configured - set S3_BUCKET_NAME (and AWS_REGION) and/or BLOB_READ_WRITE_TOKEN.'
    );
  }
  if (!file || file.size === 0) {
    throw new Error('Cannot upload an empty file');
  }

  const arrayBuffer = await file.arrayBuffer();
  const body = Buffer.from(arrayBuffer);
  const contentType = options.contentType || (file as File).type || 'application/octet-stream';

  // Which backend's URL becomes "the" URL saved to the DB. Auto-detects
  // Vercel's runtime (VERCEL=1, set automatically by their platform) unless
  // explicitly overridden with STORAGE_PRIMARY=s3|blob in the environment.
  const primary = process.env.STORAGE_PRIMARY || (process.env.VERCEL ? 'blob' : 's3');

  const results: { s3?: string; blob?: string } = {};
  const errors: string[] = [];

  await Promise.all([
    s3Configured
      ? uploadToS3(pathname, body, contentType)
          .then((url) => {
            results.s3 = url;
          })
          .catch((err) => {
            errors.push(err.message);
          })
      : Promise.resolve(),
    blobConfigured
      ? uploadToBlob(pathname, file)
          .then((url) => {
            results.blob = url;
          })
          .catch((err) => {
            errors.push(`Vercel Blob upload failed: ${err.message}`);
          })
      : Promise.resolve(),
  ]);

  // Prefer the intended primary; fall back to whichever succeeded if the
  // primary destination itself failed but the other one worked.
  const url = (primary === 'blob' ? results.blob : results.s3) || results.s3 || results.blob;

  if (!url) {
    throw new Error(`File upload failed on all configured backends: ${errors.join('; ')}`);
  }
  if (errors.length > 0) {
    console.warn(`[storage] partial upload failure for "${pathname}": ${errors.join('; ')}`);
  }

  return { url, pathname };
}

// Encrypted variant of put() for sensitive documents (see
// documentEncryption.ts) — the file is read into memory, encrypted, and
// only the ciphertext is handed to put(); no plaintext copy is written to
// disk or to either storage backend. The object key is a random UUID rather
// than `${Date.now()}-${file.name}`, so the original file name (often
// personal, e.g. "Aadhaar - <name>.pdf") isn't exposed in the bucket
// listing either — callers keep the real name in their own DB row. Throws
// (and uploads nothing) if the encryption key isn't configured.
export async function putEncrypted(pathPrefix: string, file: File | Blob): Promise<PutResult> {
  if (!file || file.size === 0) {
    throw new Error('Cannot upload an empty file');
  }
  const plaintext = Buffer.from(await file.arrayBuffer());
  let ciphertext: Buffer;
  try {
    ciphertext = await encryptDocument(plaintext);
  } finally {
    plaintext.fill(0);
  }
  return put(`${pathPrefix}/${randomUUID()}.enc`, new Blob([new Uint8Array(ciphertext)], { type: ENCRYPTED_CONTENT_TYPE }), {
    access: 'public',
    contentType: ENCRYPTED_CONTENT_TYPE,
  });
}

// Reads back an object previously written by put()/putEncrypted(), given
// the URL stored in the DB. Objects in the configured S3 bucket are fetched
// through the SDK (needs s3:GetObject), so this keeps working if the bucket
// is later made private; Vercel Blob URLs are fetched directly. Any other
// host is refused rather than fetched, so a tampered DB value can't turn
// this into a server-side request to an arbitrary URL.
export async function getObjectBytes(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  const bucket = getS3BucketName();
  const region = getS3Region();

  if (bucket && parsed.protocol === 'https:' && parsed.hostname === `${bucket}.s3.${region}.amazonaws.com`) {
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    try {
      const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    } catch (err) {
      // The bucket policy allows public reads on the app's upload prefixes,
      // but the IAM credentials may lack s3:GetObject - so a signed read is
      // refused while an unsigned one works (that's how downloads worked
      // before encryption, via a direct link). Fall back to an unsigned GET
      // of the same configured-bucket URL; encrypted objects are ciphertext
      // either way and are only decrypted here on the server.
      const code = (err as { name?: string })?.name;
      if (code === 'AccessDenied' || code === 'AllAccessDisabled') {
        const res = await fetch(parsed.toString(), { cache: 'no-store' });
        if (res.ok) return Buffer.from(await res.arrayBuffer());
      }
      throw new Error(describeS3Error(err, bucket, region, 'download'));
    }
  }

  if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.blob.vercel-storage.com')) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Blob download failed (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error('Document URL is not in a configured storage backend');
}
