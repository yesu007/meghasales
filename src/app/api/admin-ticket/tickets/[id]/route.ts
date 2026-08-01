import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';
import { updateTicket, changeTicketStatus, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/adminTicket/ticketService';
import { PRIORITIES, STATUSES, TicketStatus } from '@/lib/adminTicket/constants';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_admin_tickets');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const ticket = await prisma.adminTicket.findUnique({
      where: { id },
      include: {
        category: true,
        attachments: { orderBy: { createdAt: 'desc' } },
        activities: { orderBy: { performedAt: 'desc' } },
        reminders: { orderBy: { scheduledAt: 'asc' } },
      },
    });
    if (!ticket) return NextResponse.json({ message: 'Ticket not found' }, { status: 404 });

    const userIds = Array.from(
      new Set(
        [ticket.assignedToId, ticket.createdById, ticket.completedById, ...ticket.activities.map((a) => a.performedById)].filter(
          (v): v is number => v != null
        )
      )
    );
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userName = (uid: number | null) => {
      if (uid == null) return null;
      const u = users.find((x) => x.id === uid);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    return NextResponse.json({
      ...ticket,
      assignedToName: userName(ticket.assignedToId),
      createdByName: userName(ticket.createdById),
      completedByName: userName(ticket.completedById),
      activities: ticket.activities.map((a) => ({ ...a, performedByName: userName(a.performedById) })),
    });
  } catch (error) {
    console.error('GET /api/admin-ticket/tickets/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_admin_tickets');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (body.version == null) {
      return NextResponse.json({ message: 'version is required for optimistic-lock updates' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);

    if (body.status) {
      if (!(STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ message: `status must be one of ${STATUSES.join(', ')}` }, { status: 400 });
      }
      const ticket = await changeTicketStatus(id, body.status as TicketStatus, Number(body.version), performedById, {
        requireAttachmentOnComplete: body.status === 'COMPLETED',
      });
      await logAudit({ action: 'UPDATE', entityType: 'ADMIN_TICKET', entityId: ticket.id, newValue: { status: ticket.status }, description: `Admin ticket ${ticket.ticketNo} moved to ${ticket.status}`, request });
      return NextResponse.json(ticket);
    }

    if (body.priority && !(PRIORITIES as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ message: `priority must be one of ${PRIORITIES.join(', ')}` }, { status: 400 });
    }
    if (body.title != null && typeof body.title === 'string' && body.title.length > 200) {
      return NextResponse.json({ message: 'title must be 200 characters or fewer' }, { status: 400 });
    }

    const ticket = await updateTicket(id, {
      version: Number(body.version),
      performedById,
      title: body.title,
      description: body.description,
      priority: body.priority,
      assignedToId: body.assignedToId !== undefined ? (body.assignedToId != null ? Number(body.assignedToId) : null) : undefined,
      dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
    });

    await logAudit({ action: 'UPDATE', entityType: 'ADMIN_TICKET', entityId: ticket.id, newValue: ticket, description: `Admin ticket ${ticket.ticketNo} updated`, request });

    return NextResponse.json(ticket);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/admin-ticket/tickets/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update ticket' }, { status: 400 });
  }
}
