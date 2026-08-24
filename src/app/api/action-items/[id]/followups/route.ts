import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requireAnyPermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { addActionItemFollowUp } from '@/lib/meetings/actionItemService';
import { FOLLOWUP_FREQUENCIES } from '@/lib/meetings/constants';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requireAnyPermission(['manage_own_action_items', 'assign_action_items']);
  if (denied) return denied;

  try {
    const actionItemId = parseInt(params.id);
    const body = await request.json();
    if (!body.followUpDate) {
      return NextResponse.json({ message: 'followUpDate is required' }, { status: 400 });
    }
    if (body.frequency && !(FOLLOWUP_FREQUENCIES as readonly string[]).includes(body.frequency)) {
      return NextResponse.json({ message: `frequency must be one of ${FOLLOWUP_FREQUENCIES.join(', ')}` }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const followUp = await addActionItemFollowUp(
      actionItemId,
      {
        followUpDate: new Date(body.followUpDate),
        frequency: body.frequency || 'ONE_TIME',
        nextFollowUpDate: body.nextFollowUpDate ? new Date(body.nextFollowUpDate) : null,
        ownerId: body.ownerId != null ? Number(body.ownerId) : null,
        remarks: body.remarks || null,
      },
      currentUserId(session)
    );

    return NextResponse.json(followUp, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/action-items/[id]/followups error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add follow-up' }, { status: 400 });
  }
}
