import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { put as blobPut } from '@vercel/blob';

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

// Optional folder inside the bucket, e.g. S3_KEY_PREFIX="dev" puts every
// upload under dev/ so environments sharing one bucket stay separated.
function getS3KeyPrefix(): string {
  const prefix = (process.env.S3_KEY_PREFIX || '').trim().replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/` : '';
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
  const key = `${getS3KeyPrefix()}${pathname.replace(/^\/+/, '')}`;
  try {
    await getS3Client().send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
    );
  } catch (err) {
    throw new Error(describeS3Error(err, bucket, region));
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// Maps AWS SDK errors to a clear, secret-free message. Only the error
// name/code and bucket/region are used - never the credentials or the raw
// request (which carries the signed Authorization header).
function describeS3Error(err: unknown, bucket: string, region: string): string {
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
      return `S3 access denied for bucket "${bucket}" - the IAM user needs s3:PutObject on arn:aws:s3:::${bucket}/*`;
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
      return `S3 upload timed out or the connection dropped (${code}) - please retry`;
    default:
      return `S3 upload failed (${code}${e?.$metadata?.httpStatusCode ? `, HTTP ${e.$metadata.httpStatusCode}` : ''})`;
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
