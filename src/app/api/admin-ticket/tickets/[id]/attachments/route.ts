import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';

export const dynamic = 'force-dynamic';

// Same 10MB cap as the other attachment upload paths in this app
// (event documents, payment proof) for consistency.
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_admin_tickets');
  if (denied) return denied;

  try {
    const ticketId = parseInt(params.id);
    const attachments = await prisma.adminTicketAttachment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(attachments);
  } catch (error) {
    console.error('GET .../attachments error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_admin_tickets');
  if (denied) return denied;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { message: 'File upload is not configured (missing BLOB_READ_WRITE_TOKEN) — provision a Vercel Blob store to enable attachments' },
      { status: 503 }
    );
  }

  try {
    const ticketId = parseInt(params.id);
    const ticket = await prisma.adminTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return NextResponse.json({ message: 'Ticket not found' }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    if (file.size > MAX_ATTACHMENT_SIZE) {
      return NextResponse.json({ message: 'File exceeds the 10MB limit' }, { status: 400 });
    }

    const blob = await put(`admin-ticket-attachments/${Date.now()}-${file.name}`, file, { access: 'public' });

    const session = await getServerSession(authOptions);
    const uploadedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const attachment = await prisma.adminTicketAttachment.create({
      data: {
        ticketId,
        fileName: file.name,
        filePath: blob.url,
        mimeType: file.type || null,
        size: file.size,
        uploadedById: Number.isFinite(uploadedById) ? uploadedById : null,
      },
    });

    await prisma.adminTicketActivity.create({
      data: { ticketId, action: 'ATTACHMENT_ADDED', remarks: file.name, performedById: Number.isFinite(uploadedById) ? uploadedById : null },
    });

    await logAudit({ action: 'CREATE', entityType: 'ADMIN_TICKET_ATTACHMENT', entityId: attachment.id, newValue: attachment, description: `Attachment "${file.name}" added to admin ticket ${ticket.ticketNo}`, request });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error: any) {
    console.error('POST .../attachments error:', error);
    return NextResponse.json({ message: error.message || 'Upload failed' }, { status: 400 });
  }
}
