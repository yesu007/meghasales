import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { addActionItemComment } from '@/lib/meetings/actionItemService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Same gate as AdminTicketComment — anyone who can view the item can
// comment on it, no separate "can comment" permission.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_meetings');
  if (denied) return denied;

  try {
    const actionItemId = parseInt(params.id);
    const body = await request.json();
    if (!body.body) {
      return NextResponse.json({ message: 'body is required' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const comment = await addActionItemComment(actionItemId, body.body, currentUserId(session));

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/action-items/[id]/comments error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add comment' }, { status: 400 });
  }
}
