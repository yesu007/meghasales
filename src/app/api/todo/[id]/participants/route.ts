import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { addParticipants } from '@/lib/meetings/meetingService';
import { PARTICIPANT_TYPES, PARTICIPANT_ROLES } from '@/lib/meetings/constants';

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
    const rawParticipants = Array.isArray(body.participants) ? body.participants : [body];

    const participants = rawParticipants.map((p: any) => {
      if (!(PARTICIPANT_TYPES as readonly string[]).includes(p.participantType)) {
        throw new Error(`participantType must be one of ${PARTICIPANT_TYPES.join(', ')}`);
      }
      if (p.participantType === 'INTERNAL' && p.userId == null) {
        throw new Error('userId is required for an INTERNAL participant');
      }
      if (p.participantType === 'EXTERNAL' && !p.externalName) {
        throw new Error('externalName is required for an EXTERNAL participant');
      }
      if (p.role && !(PARTICIPANT_ROLES as readonly string[]).includes(p.role)) {
        throw new Error(`role must be one of ${PARTICIPANT_ROLES.join(', ')}`);
      }
      return {
        participantType: p.participantType,
        userId: p.userId != null ? Number(p.userId) : null,
        externalName: p.externalName || null,
        externalEmail: p.externalEmail || null,
        role: p.role || 'ATTENDEE',
      };
    });

    const session = await getServerSession(authOptions);
    const created = await addParticipants(meetingId, participants, currentUserId(session));

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/todo/[id]/participants error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add participant(s)' }, { status: 400 });
  }
}
