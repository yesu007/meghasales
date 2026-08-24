import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { updateActionItem, OptimisticLockError } from '@/lib/meetings/actionItemService';
import { ACTION_ITEM_PRIORITIES } from '@/lib/meetings/constants';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_meetings');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const actionItem = await prisma.actionItem.findUnique({
      where: { id },
      include: {
        meeting: { select: { id: true, title: true } },
        mom: { select: { id: true, status: true } },
        dependsOn: { select: { id: true, description: true, status: true } },
        dependents: { select: { id: true, description: true, status: true } },
        history: { orderBy: { performedAt: 'desc' } },
        comments: { orderBy: { createdAt: 'desc' } },
        followUps: { orderBy: { followUpDate: 'desc' } },
      },
    });
    if (!actionItem) return NextResponse.json({ message: 'Action item not found' }, { status: 404 });

    const userIds = Array.from(
      new Set(
        [
          actionItem.assignedToId,
          actionItem.createdById,
          actionItem.completedById,
          actionItem.verifiedById,
          ...actionItem.history.map((h) => h.performedById),
          ...actionItem.comments.map((c) => c.authorId),
          ...actionItem.followUps.map((f) => f.ownerId),
        ].filter((v): v is number => v != null)
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
      ...actionItem,
      assignedToName: userName(actionItem.assignedToId),
      createdByName: userName(actionItem.createdById),
      completedByName: userName(actionItem.completedById),
      verifiedByName: userName(actionItem.verifiedById),
      history: actionItem.history.map((h) => ({ ...h, performedByName: userName(h.performedById) })),
      comments: actionItem.comments.map((c) => ({ ...c, authorName: userName(c.authorId) })),
      followUps: actionItem.followUps.map((f) => ({ ...f, ownerName: userName(f.ownerId) })),
    });
  } catch (error) {
    console.error('GET /api/action-items/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('assign_action_items');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (body.version == null) {
      return NextResponse.json({ message: 'version is required for optimistic-lock updates' }, { status: 400 });
    }
    if (body.priority && !(ACTION_ITEM_PRIORITIES as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ message: `priority must be one of ${ACTION_ITEM_PRIORITIES.join(', ')}` }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const actionItem = await updateActionItem(id, {
      version: Number(body.version),
      performedById: currentUserId(session),
      description: body.description,
      assignedTeam: body.assignedTeam !== undefined ? body.assignedTeam || null : undefined,
      priority: body.priority,
      startDate: body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : undefined,
      dueDate: body.dueDate !== undefined ? new Date(body.dueDate) : undefined,
      dependsOnActionItemId: body.dependsOnActionItemId !== undefined ? (body.dependsOnActionItemId != null ? Number(body.dependsOnActionItemId) : null) : undefined,
    });

    return NextResponse.json(actionItem);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error('PATCH /api/action-items/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update action item' }, { status: 400 });
  }
}
