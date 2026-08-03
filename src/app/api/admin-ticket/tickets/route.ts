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
    const search = searchParams.get('search') || '';
    const dueDateFrom = searchParams.get('dueDateFrom') || '';
    const dueDateTo = searchParams.get('dueDateTo') || '';
    // Advance Filter passes these as comma-separated ids/values for a
    // multi-select ("any of these categories/priorities/assignees").
    const categoryIds = (searchParams.get('categoryId') || '').split(',').map((s) => parseInt(s)).filter((n) => !isNaN(n));
    const assignedToIds = (searchParams.get('assignedToId') || '').split(',').map((s) => parseInt(s)).filter((n) => !isNaN(n));
    const priorities = (searchParams.get('priority') || '').split(',').filter((p) => (PRIORITIES as readonly string[]).includes(p));

    // baseWhere excludes status so tab counts reflect the OTHER active
    // filters (search/assignee/priority/category/date range) without being
    // collapsed to whichever tab happens to be selected.
    const baseWhere: Prisma.AdminTicketWhereInput = { isActive: true };
    if (search) baseWhere.OR = [{ title: { contains: search, mode: 'insensitive' } }, { ticketNo: { contains: search, mode: 'insensitive' } }];
    if (priorities.length) baseWhere.priority = { in: priorities };
    if (categoryIds.length) baseWhere.categoryId = { in: categoryIds };
    if (assignedToIds.length) baseWhere.assignedToId = { in: assignedToIds };
    if (dueDateFrom || dueDateTo) {
      baseWhere.dueDate = {};
      if (dueDateFrom) baseWhere.dueDate.gte = new Date(dueDateFrom);
      if (dueDateTo) baseWhere.dueDate.lte = new Date(`${dueDateTo}T23:59:59.999`);
    }

    const where: Prisma.AdminTicketWhereInput = { ...baseWhere };
    if (status && (STATUSES as readonly string[]).includes(status)) where.status = status;

    const [tickets, totalElements, statusGroups] = await Promise.all([
      prisma.adminTicket.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: page * size,
        take: size,
        include: { category: true, _count: { select: { attachments: true } } },
      }),
      prisma.adminTicket.count({ where }),
      prisma.adminTicket.groupBy({ by: ['status'], where: baseWhere, _count: true }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const s of STATUSES) statusCounts[s] = 0;
    for (const g of statusGroups) statusCounts[g.status] = g._count;

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
      statusCounts,
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
