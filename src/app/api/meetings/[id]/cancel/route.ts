import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { changeMeetingStatus, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/meetings/meetingService';

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
    const id = parseInt(params.id);
    const body = await request.json();
    if (body.version == null) {
      return NextResponse.json({ message: 'version is required for optimistic-lock updates' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);

    const meeting = await changeMeetingStatus(id, 'CANCELLED', Number(body.version), performedById, body.reason || null);

    await logAudit({ action: 'UPDATE', entityType: 'MEETING', entityId: meeting.id, newValue: { status: meeting.status }, description: `Meeting "${meeting.title}" cancelled`, request });

    // TODO(Phase 4): fan out a MEETING_CANCELLED notification to participants.
    return NextResponse.json(meeting);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/meetings/[id]/cancel error:', error);
    return NextResponse.json({ message: error.message || 'Failed to cancel meeting' }, { status: 400 });
  }
}
