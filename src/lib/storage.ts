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

export function isS3Configured(): boolean {
  return !!process.env.S3_BUCKET_NAME;
}

// The guard every upload route should actually check - either backend
// being configured is enough for uploads to work.
export function isStorageConfigured(): boolean {
  return isBlobConfigured() || isS3Configured();
}

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
  }
  return s3Client;
}

async function uploadToS3(pathname: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME!;
  const region = process.env.AWS_REGION || 'ap-south-1';
  await getS3Client().send(
    new PutObjectCommand({ Bucket: bucket, Key: pathname, Body: body, ContentType: contentType })
  );
  return `https://${bucket}.s3.${region}.amazonaws.com/${pathname}`;
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
            errors.push(`S3 upload failed: ${err.message}`);
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
