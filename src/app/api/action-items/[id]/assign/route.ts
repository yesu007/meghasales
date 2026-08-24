import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { assignActionItem, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/meetings/actionItemService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('assign_action_items');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (body.version == null || body.assignedToId == null) {
      return NextResponse.json({ message: 'version and assignedToId are required' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const actionItem = await assignActionItem(id, Number(body.assignedToId), Number(body.version), currentUserId(session));

    return NextResponse.json(actionItem);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/action-items/[id]/assign error:', error);
    return NextResponse.json({ message: error.message || 'Failed to assign action item' }, { status: 400 });
  }
}
