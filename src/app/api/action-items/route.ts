import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { createActionItem } from '@/lib/meetings/actionItemService';
import { ACTION_ITEM_STATUSES, ACTION_ITEM_PRIORITIES, MEETING_REF_TYPES } from '@/lib/meetings/constants';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_meetings');
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '20');
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const meetingId = searchParams.get('meetingId') ? parseInt(searchParams.get('meetingId')!) : undefined;
    const momId = searchParams.get('momId') ? parseInt(searchParams.get('momId')!) : undefined;
    const dueDateFrom = searchParams.get('dueDateFrom') || '';
    const dueDateTo = searchParams.get('dueDateTo') || '';
    const assignedToIds = (searchParams.get('assignedToId') || '').split(',').map((s) => parseInt(s)).filter((n) => !isNaN(n));
    const priorities = (searchParams.get('priority') || '').split(',').filter((p) => (ACTION_ITEM_PRIORITIES as readonly string[]).includes(p));

    // baseWhere excludes status so tab counts reflect the OTHER active
    // filters, same convention as /api/meetings and /api/admin-ticket/tickets.
    const baseWhere: Prisma.ActionItemWhereInput = {};
    if (search) baseWhere.description = { contains: search, mode: 'insensitive' };
    if (meetingId != null) baseWhere.meetingId = meetingId;
    if (momId != null) baseWhere.momId = momId;
    if (priorities.length) baseWhere.priority = { in: priorities };
    if (assignedToIds.length) baseWhere.assignedToId = { in: assignedToIds };
    if (dueDateFrom || dueDateTo) {
      baseWhere.dueDate = {};
      if (dueDateFrom) baseWhere.dueDate.gte = new Date(dueDateFrom);
      if (dueDateTo) baseWhere.dueDate.lte = new Date(`${dueDateTo}T23:59:59.999`);
    }

    const where: Prisma.ActionItemWhereInput = { ...baseWhere };
    if (status && (ACTION_ITEM_STATUSES as readonly string[]).includes(status)) where.status = status;

    const [items, totalElements, statusGroups] = await Promise.all([
      prisma.actionItem.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: page * size,
        take: size,
        include: { meeting: { select: { id: true, title: true } }, dependsOn: { select: { id: true, description: true, status: true } } },
      }),
      prisma.actionItem.count({ where }),
      prisma.actionItem.groupBy({ by: ['status'], where: baseWhere, _count: true }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const s of ACTION_ITEM_STATUSES) statusCounts[s] = 0;
    for (const g of statusGroups) statusCounts[g.status] = g._count;

    const userIds = Array.from(new Set(items.flatMap((i) => [i.assignedToId, i.createdById]).filter((id): id is number => id != null)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userName = (id: number | null) => {
      if (id == null) return null;
      const u = users.find((x) => x.id === id);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    const content = items.map((i) => ({
      ...i,
      assignedToName: userName(i.assignedToId),
      createdByName: userName(i.createdById),
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
    console.error('GET /api/action-items error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('assign_action_items');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.meetingId || !body.description || !body.dueDate) {
      return NextResponse.json({ message: 'meetingId, description, and dueDate are required' }, { status: 400 });
    }
    if (body.priority && !(ACTION_ITEM_PRIORITIES as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ message: `priority must be one of ${ACTION_ITEM_PRIORITIES.join(', ')}` }, { status: 400 });
    }
    if (body.refType && !(MEETING_REF_TYPES as readonly string[]).includes(body.refType)) {
      return NextResponse.json({ message: `refType must be one of ${MEETING_REF_TYPES.join(', ')}` }, { status: 400 });
    }
    const dueDate = new Date(body.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ message: 'dueDate must be a valid date' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const createdById = currentUserId(session);

    const actionItem = await createActionItem({
      meetingId: Number(body.meetingId),
      momId: body.momId != null ? Number(body.momId) : null,
      refType: body.refType || null,
      refId: body.refId != null ? Number(body.refId) : null,
      description: body.description,
      assignedToId: body.assignedToId != null ? Number(body.assignedToId) : null,
      assignedTeam: body.assignedTeam || null,
      priority: body.priority || 'MEDIUM',
      startDate: body.startDate ? new Date(body.startDate) : null,
      dueDate,
      dependsOnActionItemId: body.dependsOnActionItemId != null ? Number(body.dependsOnActionItemId) : null,
      createdById,
    });

    return NextResponse.json(actionItem, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/action-items error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create action item' }, { status: 400 });
  }
}
