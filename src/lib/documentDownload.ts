import { NextRequest, NextResponse } from 'next/server';
import { getObjectBytes } from '@/lib/storage';
import { decryptDocument, isEncryptedDocument } from '@/lib/documentEncryption';

// Only these render inline ("View"); everything else is always sent as an
// attachment, so a stored file can never be rendered as HTML/SVG/script in
// the app's own origin.
const INLINE_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// Shared tail of every document ".../file" endpoint — the caller has already
// done its own permission/ownership check and looked the row up; this reads
// the stored object, decrypts it (see documentEncryption.ts), and returns
// the original bytes. Files uploaded before encryption was introduced are
// still plain objects and are passed through unchanged (detected by the
// encrypted header's magic bytes), so old documents keep opening.
// `?download=1` forces an attachment; otherwise PDFs/images open inline.
export async function serveStoredDocument(
  request: NextRequest,
  doc: { url: string; fileName: string; mimeType: string | null }
): Promise<NextResponse> {
  try {
    const stored = await getObjectBytes(doc.url);
    const body = isEncryptedDocument(stored) ? await decryptDocument(stored) : stored;

    const mimeType = doc.mimeType || 'application/octet-stream';
    const wantsDownload = new URL(request.url).searchParams.get('download') === '1';
    const disposition = !wantsDownload && INLINE_MIME_TYPES.has(mimeType) ? 'inline' : 'attachment';

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(body.length),
        'Content-Disposition': contentDisposition(disposition, doc.fileName),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Document download failed:', error);
    return NextResponse.json({ message: 'Could not open this document' }, { status: 502 });
  }
}
