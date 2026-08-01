import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';

export const dynamic = 'force-dynamic';

// Gated on view_admin_tickets (not manage) rather than the create/edit
// permission — commenting is discussion, not a ticket mutation, same as
// add_lead_discussion being separate from manage_lead_events for Lead
// Events. Anyone who can see the ticket (including MANAGEMENT, which only
// holds view_admin_tickets) can add a note.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_admin_tickets');
  if (denied) return denied;

  try {
    const ticketId = parseInt(params.id);
    const comments = await prisma.adminTicketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });

    const authorIds = Array.from(new Set(comments.map((c) => c.authorId).filter((id): id is number => id != null)));
    const authors = authorIds.length
      ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const authorName = (id: number | null) => {
      if (id == null) return null;
      const u = authors.find((x) => x.id === id);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    return NextResponse.json(comments.map((c) => ({ ...c, authorName: authorName(c.authorId) })));
  } catch (error) {
    console.error('GET .../comments error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_admin_tickets');
  if (denied) return denied;

  try {
    const ticketId = parseInt(params.id);
    const body = await request.json();
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text) return NextResponse.json({ message: 'Comment body is required' }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ message: 'Comment must be 4000 characters or fewer' }, { status: 400 });

    const ticket = await prisma.adminTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return NextResponse.json({ message: 'Ticket not found' }, { status: 404 });

    const session = await getServerSession(authOptions);
    const authorId = session?.user ? parseInt((session.user as any).id, 10) : null;

    const comment = await prisma.adminTicketComment.create({
      data: { ticketId, body: text, authorId: Number.isFinite(authorId) ? authorId : null },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    console.error('POST .../comments error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add comment' }, { status: 400 });
  }
}
