import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Storage backend for Customer NDA/Contract attachments specifically —
// s3://<AWS_S3_BUCKET>/customer-contracts/ — moved off Vercel Blob after a
// production incident where the project's BLOB_READ_WRITE_TOKEN went stale
// ("This store does not exist") and broke every upload. Scoped to this one
// feature only: KYC documents and every other upload in the app
// (src/lib/eventDocumentUpload.ts, customerDocumentUpload.ts's
// uploadCustomerDocumentBlob) are untouched and still use Vercel Blob.
//
// Objects are private (no public-read ACL/bucket policy needed) — NDAs and
// contracts are sensitive documents. Reads go through a short-lived
// presigned GET URL generated fresh each time a contract is fetched
// (resolveContractFileUrl below), never a permanent public link.
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — long enough to survive opening the tab and clicking Download, short enough that a leaked link goes stale soon after.

let _client: S3Client | null = null;
function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

function bucket(): string {
  return process.env.AWS_S3_BUCKET!;
}

export function isS3Configured(): boolean {
  return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION && process.env.AWS_S3_BUCKET);
}

// Uploads and returns the bare object key (e.g.
// "customer-contracts/1758700000000-nda.pdf") — NOT a URL. The object is
// private, so there is no permanent URL to hand back; see
// resolveContractFileUrl for turning a key into something viewable.
export async function uploadContractFileToS3(file: File, keyPrefix: string): Promise<{ key: string }> {
  const key = `${keyPrefix}/${Date.now()}-${file.name}`;
  const body = Buffer.from(await file.arrayBuffer());
  await getClient().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    Body: body,
    ContentType: file.type || 'application/octet-stream',
  }));
  return { key };
}

// CustomerContract.fileUrl predates this migration and, on any row
// uploaded before it, holds a real Vercel Blob URL (still directly
// viewable — those files weren't moved). Rows uploaded after this change
// store a bare S3 key instead. Tell them apart by shape rather than
// migrating old rows: a URL always has a scheme, a key never does.
function isFullUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

// Turns a CustomerContract.fileUrl value into something the browser can
// actually load: passes an old Blob URL through unchanged, or signs a
// fresh short-lived GET URL for an S3 key. Called on every contract read
// (list + single) so the link is never stale by the time it reaches the
// client.
export async function resolveContractFileUrl(value: string, fileName?: string | null): Promise<string> {
  if (isFullUrl(value)) return value;
  const command = new GetObjectCommand({
    Bucket: bucket(),
    Key: value,
    ...(fileName ? { ResponseContentDisposition: `inline; filename="${encodeURIComponent(fileName)}"` } : {}),
  });
  return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}
