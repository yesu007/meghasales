import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';
import { createTicket } from '@/lib/adminTicket/ticketService';
import { PRIORITIES, STATUSES } from '@/lib/adminTicket/constants';
import { dispatchDueReminders } from '@/lib/adminTicket/dispatcher';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_admin_tickets');
  if (denied) return denied;

  // On-demand dispatch, same pattern as the accounting reminders page —
  // makes the module useful without waiting for the next cron tick.
  // Best-effort: a dispatch hiccup must not block the list from loading.
  try {
    await dispatchDueReminders();
  } catch (error) {
    console.error('GET /api/admin-ticket/tickets on-demand dispatch error:', error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '20');
    const status = searchParams.get('status') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const assignedToId = searchParams.get('assignedToId') || '';
    const priority = searchParams.get('priority') || '';

    const where: Prisma.AdminTicketWhereInput = { isActive: true };
    if (status && (STATUSES as readonly string[]).includes(status)) where.status = status;
    if (priority && (PRIORITIES as readonly string[]).includes(priority)) where.priority = priority;
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (assignedToId) where.assignedToId = parseInt(assignedToId);

    const [tickets, totalElements] = await Promise.all([
      prisma.adminTicket.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: page * size,
        take: size,
        include: { category: true, _count: { select: { attachments: true } } },
      }),
      prisma.adminTicket.count({ where }),
    ]);

    const userIds = Array.from(
      new Set(tickets.flatMap((t) => [t.assignedToId, t.createdById]).filter((id): id is number => id != null))
    );
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userName = (id: number | null) => {
      if (id == null) return null;
      const u = users.find((x) => x.id === id);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    const content = tickets.map((t) => ({
      ...t,
      assignedToName: userName(t.assignedToId),
      createdByName: userName(t.createdById),
      attachmentCount: t._count.attachments,
    }));

    return NextResponse.json({
      content,
      page,
      size,
      totalElements,
      totalPages: Math.ceil(totalElements / size),
    });
  } catch (error) {
    console.error('GET /api/admin-ticket/tickets error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_admin_tickets');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.categoryId || !body.title) {
      return NextResponse.json({ message: 'categoryId and title are required' }, { status: 400 });
    }
    if (typeof body.title === 'string' && body.title.length > 200) {
      return NextResponse.json({ message: 'title must be 200 characters or fewer' }, { status: 400 });
    }
    if (body.priority && !(PRIORITIES as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ message: `priority must be one of ${PRIORITIES.join(', ')}` }, { status: 400 });
    }

    const category = await prisma.adminTicketCategory.findUnique({ where: { id: Number(body.categoryId) } });
    if (!category || !category.isActive) {
      return NextResponse.json({ message: 'Category not found' }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const createdById = currentUserId(session);

    const ticket = await createTicket({
      categoryId: category.id,
      title: body.title,
      description: body.description || null,
      priority: body.priority || category.defaultPriority,
      assignedToId: body.assignedToId != null ? Number(body.assignedToId) : null,
      createdById,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      refType: body.refType || null,
      refId: body.refId != null ? Number(body.refId) : null,
    });

    await logAudit({ action: 'CREATE', entityType: 'ADMIN_TICKET', entityId: ticket.id, newValue: ticket, description: `Admin ticket ${ticket.ticketNo} "${ticket.title}" created`, request });

    return NextResponse.json(ticket, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/admin-ticket/tickets error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create ticket' }, { status: 400 });
  }
}
