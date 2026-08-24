import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requireAnyPermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { completeActionItemFollowUp } from '@/lib/meetings/actionItemService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function POST(request: NextRequest, { params }: { params: { followupId: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requireAnyPermission(['manage_own_action_items', 'assign_action_items']);
  if (denied) return denied;

  try {
    const followupId = parseInt(params.followupId);
    const session = await getServerSession(authOptions);
    const followUp = await completeActionItemFollowUp(followupId, currentUserId(session));

    return NextResponse.json(followUp);
  } catch (error: any) {
    console.error('POST /api/action-items/followups/[followupId]/complete error:', error);
    return NextResponse.json({ message: error.message || 'Failed to complete follow-up' }, { status: 400 });
  }
}
