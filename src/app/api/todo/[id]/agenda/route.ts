import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { addAgendaItem } from '@/lib/meetings/meetingService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_meetings');
  if (denied) return denied;

  try {
    const meetingId = parseInt(params.id);
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { id: true } });
    if (!meeting) return NextResponse.json({ message: 'Meeting not found' }, { status: 404 });

    const body = await request.json();
    if (!body.title) {
      return NextResponse.json({ message: 'title is required' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const item = await addAgendaItem(
      meetingId,
      {
        title: body.title,
        description: body.description || null,
        timeAllocatedMinutes: body.timeAllocatedMinutes != null ? Number(body.timeAllocatedMinutes) : null,
        ownerId: body.ownerId != null ? Number(body.ownerId) : null,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      },
      currentUserId(session)
    );

    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/todo/[id]/agenda error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add agenda item' }, { status: 400 });
  }
}
