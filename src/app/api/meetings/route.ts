import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { createMeeting } from '@/lib/meetings/meetingService';
import { MEETING_TYPES, MEETING_PRIORITIES, MEETING_STATUSES, MEETING_REF_TYPES } from '@/lib/meetings/constants';

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
    const scheduledFrom = searchParams.get('scheduledFrom') || '';
    const scheduledTo = searchParams.get('scheduledTo') || '';
    const organizerIds = (searchParams.get('organizerId') || '').split(',').map((s) => parseInt(s)).filter((n) => !isNaN(n));
    const meetingTypes = (searchParams.get('meetingType') || '').split(',').filter((t) => (MEETING_TYPES as readonly string[]).includes(t));

    // baseWhere excludes status so tab counts reflect the OTHER active
    // filters, same convention as /api/admin-ticket/tickets.
    const baseWhere: Prisma.MeetingWhereInput = {};
    if (search) baseWhere.OR = [{ title: { contains: search, mode: 'insensitive' } }, { purpose: { contains: search, mode: 'insensitive' } }];
    if (meetingTypes.length) baseWhere.meetingType = { in: meetingTypes };
    if (organizerIds.length) baseWhere.organizerId = { in: organizerIds };
    if (scheduledFrom || scheduledTo) {
      baseWhere.scheduledAt = {};
      if (scheduledFrom) baseWhere.scheduledAt.gte = new Date(scheduledFrom);
      if (scheduledTo) baseWhere.scheduledAt.lte = new Date(`${scheduledTo}T23:59:59.999`);
    }

    const where: Prisma.MeetingWhereInput = { ...baseWhere };
    if (status && (MEETING_STATUSES as readonly string[]).includes(status)) where.status = status;

    const [meetings, totalElements, statusGroups] = await Promise.all([
      prisma.meeting.findMany({
        where,
        orderBy: [{ scheduledAt: 'asc' }],
        skip: page * size,
        take: size,
        include: { _count: { select: { participants: true, agendaItems: true } } },
      }),
      prisma.meeting.count({ where }),
      prisma.meeting.groupBy({ by: ['status'], where: baseWhere, _count: true }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const s of MEETING_STATUSES) statusCounts[s] = 0;
    for (const g of statusGroups) statusCounts[g.status] = g._count;

    const userIds = Array.from(new Set(meetings.map((m) => m.organizerId).filter((id): id is number => id != null)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userName = (id: number | null) => {
      if (id == null) return null;
      const u = users.find((x) => x.id === id);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    const content = meetings.map((m) => ({
      ...m,
      organizerName: userName(m.organizerId),
      participantCount: m._count.participants,
      agendaItemCount: m._count.agendaItems,
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
    console.error('GET /api/meetings error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_meetings');
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.title || !body.meetingType || !body.scheduledAt) {
      return NextResponse.json({ message: 'title, meetingType, and scheduledAt are required' }, { status: 400 });
    }
    if (typeof body.title === 'string' && body.title.length > 200) {
      return NextResponse.json({ message: 'title must be 200 characters or fewer' }, { status: 400 });
    }
    if (!(MEETING_TYPES as readonly string[]).includes(body.meetingType)) {
      return NextResponse.json({ message: `meetingType must be one of ${MEETING_TYPES.join(', ')}` }, { status: 400 });
    }
    if (body.priority && !(MEETING_PRIORITIES as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ message: `priority must be one of ${MEETING_PRIORITIES.join(', ')}` }, { status: 400 });
    }
    if (body.refType && !(MEETING_REF_TYPES as readonly string[]).includes(body.refType)) {
      return NextResponse.json({ message: `refType must be one of ${MEETING_REF_TYPES.join(', ')}` }, { status: 400 });
    }
    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ message: 'scheduledAt must be a valid date/time' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const createdById = currentUserId(session);

    const meeting = await createMeeting({
      title: body.title,
      meetingType: body.meetingType,
      purpose: body.purpose || null,
      scheduledAt,
      durationMinutes: body.durationMinutes != null ? Number(body.durationMinutes) : null,
      location: body.location || null,
      meetingLink: body.meetingLink || null,
      organizerId: body.organizerId != null ? Number(body.organizerId) : createdById,
      priority: body.priority || 'MEDIUM',
      refType: body.refType || null,
      refId: body.refId != null ? Number(body.refId) : null,
      createdById,
    });

    await logAudit({ action: 'CREATE', entityType: 'MEETING', entityId: meeting.id, newValue: meeting, description: `Meeting "${meeting.title}" scheduled`, request });

    return NextResponse.json(meeting, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/meetings error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create meeting' }, { status: 400 });
  }
}
