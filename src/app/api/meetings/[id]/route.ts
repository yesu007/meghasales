import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { updateMeeting, changeMeetingStatus, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/meetings/meetingService';
import { MEETING_PRIORITIES, MEETING_STATUSES, MeetingStatus } from '@/lib/meetings/constants';

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
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        participants: { orderBy: { createdAt: 'asc' } },
        agendaItems: { orderBy: { sortOrder: 'asc' } },
        activities: { orderBy: { performedAt: 'desc' } },
      },
    });
    if (!meeting) return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });

    const userIds = Array.from(
      new Set(
        [meeting.organizerId, meeting.createdById, ...meeting.participants.map((p) => p.userId), ...meeting.agendaItems.map((a) => a.ownerId), ...meeting.activities.map((a) => a.performedById)].filter(
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
      ...meeting,
      organizerName: userName(meeting.organizerId),
      createdByName: userName(meeting.createdById),
      participants: meeting.participants.map((p) => ({ ...p, userName: userName(p.userId) })),
      agendaItems: meeting.agendaItems.map((a) => ({ ...a, ownerName: userName(a.ownerId) })),
      activities: meeting.activities.map((a) => ({ ...a, performedByName: userName(a.performedById) })),
    });
  } catch (error) {
    console.error('GET /api/meetings/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_meetings');
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
      if (!(MEETING_STATUSES as readonly string[]).includes(body.status)) {
        return NextResponse.json({ message: `status must be one of ${MEETING_STATUSES.join(', ')}` }, { status: 400 });
      }
      const meeting = await changeMeetingStatus(id, body.status as MeetingStatus, Number(body.version), performedById, body.remarks || null);
      await logAudit({ action: 'UPDATE', entityType: 'MEETING', entityId: meeting.id, newValue: { status: meeting.status }, description: `Meeting "${meeting.title}" moved to ${meeting.status}`, request });
      return NextResponse.json(meeting);
    }

    if (body.priority && !(MEETING_PRIORITIES as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ message: `priority must be one of ${MEETING_PRIORITIES.join(', ')}` }, { status: 400 });
    }
    if (body.title != null && typeof body.title === 'string' && body.title.length > 200) {
      return NextResponse.json({ message: 'title must be 200 characters or fewer' }, { status: 400 });
    }

    const meeting = await updateMeeting(id, {
      version: Number(body.version),
      performedById,
      title: body.title,
      purpose: body.purpose !== undefined ? body.purpose || null : undefined,
      location: body.location !== undefined ? body.location || null : undefined,
      meetingLink: body.meetingLink !== undefined ? body.meetingLink || null : undefined,
      durationMinutes: body.durationMinutes !== undefined ? (body.durationMinutes != null ? Number(body.durationMinutes) : null) : undefined,
      priority: body.priority,
      organizerId: body.organizerId !== undefined ? (body.organizerId != null ? Number(body.organizerId) : null) : undefined,
    });

    await logAudit({ action: 'UPDATE', entityType: 'MEETING', entityId: meeting.id, newValue: meeting, description: `Meeting "${meeting.title}" updated`, request });

    return NextResponse.json(meeting);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/meetings/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update meeting' }, { status: 400 });
  }
}
