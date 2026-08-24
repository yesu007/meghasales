import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { rescheduleMeeting, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/meetings/meetingService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Separate from the generic PATCH — this is the one edit participants
// actually need re-notifying about (design doc §11), so it's its own
// endpoint even though today it just calls through to the service layer.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_meetings');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (body.version == null || !body.scheduledAt) {
      return NextResponse.json({ message: 'version and scheduledAt are required' }, { status: 400 });
    }
    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ message: 'scheduledAt must be a valid date/time' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);

    const meeting = await rescheduleMeeting(id, scheduledAt, Number(body.version), performedById, body.reason || null);

    await logAudit({ action: 'UPDATE', entityType: 'MEETING', entityId: meeting.id, newValue: { scheduledAt: meeting.scheduledAt }, description: `Meeting "${meeting.title}" rescheduled`, request });

    // TODO(Phase 4): fan out a MEETING_RESCHEDULED notification to
    // participants once the notification-template/preference tables exist.
    return NextResponse.json(meeting);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/meetings/[id]/reschedule error:', error);
    return NextResponse.json({ message: error.message || 'Failed to reschedule meeting' }, { status: 400 });
  }
}
