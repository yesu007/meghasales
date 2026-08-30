import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateEventDocumentFile, uploadEventDocumentBlob } from '@/lib/eventDocumentUpload';

export const dynamic = 'force-dynamic';

// Company documents — incorporation certificate, tax registration
// certificate, etc. — scoped to one legal entity. Reuses EventDocument/
// EventDocumentVersion (see prisma/schema.prisma comment on
// EventDocument.legalEntityId) and the same upload plumbing as Lead
// documents (src/app/api/leads/[id]/documents/route.ts), just keyed by
// legalEntityId instead of leadId.
export async function GET(request: NextRequest, { params }: { params: { id: string; entityId: string } }) {
  const denied = await requirePermission('view_companies');
  if (denied) return denied;

  try {
    const entityId = parseInt(params.entityId);
    const documents = await prisma.eventDocument.findMany({
      where: { legalEntityId: entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        uploadedBy: { select: { firstName: true, lastName: true } },
        _count: { select: { versions: true } },
      },
    });
    return NextResponse.json(documents);
  } catch (error) {
    console.error('GET .../legal-entities/[entityId]/documents error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string; entityId: string } }) {
  const denied = await requirePermission('manage_companies');
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const companyId = parseInt(params.id);
    const entityId = parseInt(params.entityId);
    const entity = await prisma.companyLegalEntity.findUnique({ where: { id: entityId } });
    if (!entity || entity.companyId !== companyId) return NextResponse.json({ message: 'Legal entity not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const description = (formData.get('description') as string) || null;

    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    const validationError = validateEventDocumentFile(file);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const blob = await uploadEventDocumentBlob(file, 'company-legal-entity-documents');

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.eventDocument.create({
        data: {
          legalEntityId: entityId,
          fileName: file.name,
          description,
          mimeType: file.type || null,
          uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
        },
      });
      await tx.eventDocumentVersion.create({
        data: {
          eventDocumentId: doc.id,
          versionNumber: 1,
          fileUrl: blob.url,
          fileName: file.name,
          fileType: file.name.split('.').pop() || null,
          mimeType: file.type || null,
          fileSize: file.size,
          uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
        },
      });
      return doc;
    });

    await logAudit({ action: 'CREATE', entityType: 'EVENT_DOCUMENT', entityId: document.id, newValue: document, description: `Document "${file.name}" uploaded for legal entity "${entity.legalName}"`, request });

    return NextResponse.json(document, { status: 201 });
  } catch (error: any) {
    console.error('POST .../legal-entities/[entityId]/documents error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
