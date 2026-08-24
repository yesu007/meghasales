import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { changeMeetingStatus, resolveMeetingRecipientUserIds, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/meetings/meetingService';
import { notifyManyViaTemplate } from '@/lib/meetings/notificationTemplates';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

function appUrl(path: string): string {
  const base = process.env.NEXTAUTH_URL || '';
  return `${base}${path}`;
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

    try {
      const recipientUserIds = await resolveMeetingRecipientUserIds(meeting.id);
      if (recipientUserIds.length > 0) {
        await notifyManyViaTemplate({
          eventType: 'MEETING_CANCELLED',
          channels: ['IN_APP', 'EMAIL'],
          entityType: 'MEETING',
          entityId: meeting.id,
          recipientUserIds,
          vars: {
            meetingTitle: meeting.title,
            scheduledAt: dayjs(meeting.scheduledAt).format('DD MMM YYYY, h:mm A'),
            reason: body.reason || '',
            actionUrl: appUrl(`/dashboard/todo/${meeting.id}`),
          },
        });
      }
    } catch (error) {
      console.error(`MEETING_CANCELLED notification fan-out failed for meeting ${meeting.id}:`, error);
    }

    return NextResponse.json(meeting);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/todo/[id]/cancel error:', error);
    return NextResponse.json({ message: error.message || 'Failed to cancel meeting' }, { status: 400 });
  }
}
