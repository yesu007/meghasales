import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateEventInput } from '@/lib/eventValidation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  try {
    const event = await prisma.event.findUnique({
      where: { id: parseInt(params.eventId) },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        documents: {
          where: { discussionId: null },
          include: { versions: { orderBy: { versionNumber: 'desc' } }, uploadedBy: { select: { firstName: true, lastName: true } } },
        },
        discussions: {
          orderBy: { createdAt: 'desc' },
          include: {
            author: { select: { firstName: true, lastName: true } },
            assignedTo: { select: { firstName: true, lastName: true } },
            attachments: { include: { versions: { orderBy: { versionNumber: 'desc' } } } },
          },
        },
      },
    });
    if (!event || event.leadId !== parseInt(params.id)) {
      return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (error) {
    console.error('GET /api/leads/[id]/events/[eventId] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;

  try {
    const id = parseInt(params.eventId);
    const body = await request.json();

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing || existing.leadId !== parseInt(params.id)) {
      return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    }

    const validationError = validateEventInput({
      title: body.title ?? existing.title,
      eventType: body.eventType ?? existing.eventType,
      eventDateTime: body.eventDateTime ?? existing.eventDateTime.toISOString(),
      duration: body.duration !== undefined ? body.duration : existing.duration,
      followUpDate: body.followUpDate !== undefined ? body.followUpDate : existing.followUpDate?.toISOString() ?? null,
      status: body.status ?? existing.status,
    });
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const event = await prisma.event.update({
      where: { id },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.eventType && { eventType: body.eventType }),
        ...(body.eventDateTime && { eventDateTime: new Date(body.eventDateTime) }),
        ...(body.duration !== undefined && { duration: body.duration != null ? Number(body.duration) : null }),
        ...(body.participants !== undefined && { participants: body.participants }),
        ...(body.location !== undefined && { location: body.location }),
        ...(body.meetingLink !== undefined && { meetingLink: body.meetingLink }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.nextAction !== undefined && { nextAction: body.nextAction }),
        ...(body.followUpDate !== undefined && { followUpDate: body.followUpDate ? new Date(body.followUpDate) : null }),
        ...(body.status && { status: body.status }),
      },
    });

    const session = await getServerSession(authOptions);
    const performedById = session?.user ? parseInt((session.user as any).id, 10) : null;

    if (body.status && body.status !== existing.status && (body.status === 'COMPLETED' || body.status === 'CANCELLED')) {
      await prisma.leadActivity.create({
        data: {
          leadId: event.leadId,
          activityType: body.status === 'COMPLETED' ? 'EVENT_COMPLETED' : 'EVENT_CANCELLED',
          description: `Event "${event.title}" marked ${body.status.toLowerCase()}`,
          performedById: Number.isFinite(performedById) ? performedById : null,
        },
      });
    }

    await logAudit({ action: 'UPDATE', entityType: 'EVENT', entityId: id, oldValue: existing, newValue: event, description: `Event "${event.title}" updated`, request });

    return NextResponse.json(event);
  } catch (error: any) {
    console.error('PUT /api/leads/[id]/events/[eventId] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update event' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string; eventId: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;

  try {
    const id = parseInt(params.eventId);
    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing || existing.leadId !== parseInt(params.id)) {
      return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    }

    await prisma.event.delete({ where: { id } });

    await prisma.leadActivity.create({
      data: {
        leadId: existing.leadId,
        activityType: 'EVENT_DELETED',
        description: `Event "${existing.title}" deleted`,
      },
    });

    await logAudit({ action: 'DELETE', entityType: 'EVENT', entityId: id, oldValue: existing, description: `Event "${existing.title}" deleted`, request });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('DELETE /api/leads/[id]/events/[eventId] error:', error);
    return NextResponse.json({ message: 'Failed to delete event' }, { status: 400 });
  }
}
