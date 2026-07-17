import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { validateEventInput } from '@/lib/eventValidation';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('view_lead_events');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';

    const events = await prisma.event.findMany({
      where: { leadId, ...(status && { status }) },
      orderBy: { eventDateTime: 'desc' },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { documents: true, discussions: true } },
      },
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('GET /api/leads/[id]/events error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requirePermission('manage_lead_events');
  if (denied) return denied;

  try {
    const leadId = parseInt(params.id);
    const body = await request.json();

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return NextResponse.json({ message: 'Lead not found' }, { status: 404 });
    if (lead.status !== 'CONFIRMED') {
      return NextResponse.json({ message: 'Events can only be added to a Confirmed lead' }, { status: 400 });
    }

    const validationError = validateEventInput(body);
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });

    const session = await getServerSession(authOptions);
    const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;

    const event = await prisma.event.create({
      data: {
        leadId,
        title: body.title,
        eventType: body.eventType,
        eventDateTime: new Date(body.eventDateTime),
        duration: body.duration != null ? Number(body.duration) : null,
        participants: body.participants || null,
        location: body.location || null,
        meetingLink: body.meetingLink || null,
        description: body.description || null,
        nextAction: body.nextAction || null,
        followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
        status: 'SCHEDULED',
        createdById: Number.isFinite(createdById) ? createdById : null,
      },
    });

    await prisma.leadActivity.create({
      data: {
        leadId,
        activityType: 'EVENT_CREATED',
        description: `Event "${event.title}" scheduled for ${lead.companyName}`,
        performedById: Number.isFinite(createdById) ? createdById : null,
      },
    });

    await logAudit({ action: 'CREATE', entityType: 'EVENT', entityId: event.id, newValue: event, description: `Event "${event.title}" created for ${lead.companyName}`, request });

    return NextResponse.json(event, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/leads/[id]/events error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create event' }, { status: 400 });
  }
}
