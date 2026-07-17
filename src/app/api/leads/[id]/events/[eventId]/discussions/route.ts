import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission, requireAnyPermission } from '@/lib/rbac';
import { validateDiscussionInput } from '@/lib/eventValidation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  try {
    const eventId = parseInt(params.eventId);
    const discussions = await prisma.eventDiscussion.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        attachments: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } },
      },
    });
    return NextResponse.json(discussions);
  } catch (error) {
    console.error('GET .../discussions error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  const denied = await requireAnyPermission(['manage_lead_events', 'add_lead_discussion']);
  if (denied) return denied;

  try {
    const eventId = parseInt(params.eventId);
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.leadId !== parseInt(params.id)) {
      return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    }

    const body = await request.json();
    const validationError = validateDiscussionInput(body);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const session = await getServerSession(authOptions);
    const authorId = session?.user ? parseInt((session.user as any).id, 10) : null;

    const discussion = await prisma.eventDiscussion.create({
      data: {
        eventId,
        authorId: Number.isFinite(authorId) ? authorId : null,
        notes: body.notes,
        decisionsTaken: body.decisionsTaken || null,
        actionItems: body.actionItems || null,
        assignedToId: body.assignedToId ? parseInt(body.assignedToId) : null,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        completionStatus: body.completionStatus || 'OPEN',
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId: event.leadId,
        activityType: 'DISCUSSION_ADDED',
        description: `Discussion added on event "${event.title}"`,
        performedById: Number.isFinite(authorId) ? authorId : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'EVENT_DISCUSSION', entityId: discussion.id, newValue: discussion, description: `Discussion added on event "${event.title}"`, request });

    return NextResponse.json(discussion, { status: 201 });
  } catch (error: any) {
    console.error('POST .../discussions error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add discussion' }, { status: 400 });
  }
}
