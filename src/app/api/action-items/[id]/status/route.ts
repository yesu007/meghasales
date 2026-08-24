import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { checkAnyPermission, checkPermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { changeActionItemStatus, OptimisticLockError, InvalidStatusTransitionError, ForbiddenTransitionError, DependencyNotSatisfiedError } from '@/lib/meetings/actionItemService';
import { ACTION_ITEM_STATUSES, ActionItemStatus } from '@/lib/meetings/constants';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// A single endpoint for every status transition — who's actually allowed to
// make THIS transition depends on where it's going (owner self-service vs.
// assign/verify/close), which changeActionItemStatus resolves per-call via
// getActionItemTransitionCapability. This route's job is just: require
// login, require at least one of the module's action-item permissions (so
// a user with none of them gets a clean 403 instead of reaching the
// service), and hand the service the caller's actual permission set.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const relevantPermissions = ['assign_action_items', 'manage_own_action_items', 'verify_action_items', 'close_action_items'];
  if (!checkAnyPermission(session, relevantPermissions)) {
    return NextResponse.json({ message: `Forbidden — requires one of: ${relevantPermissions.join(', ')}` }, { status: 403 });
  }

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (body.version == null || !body.toStatus) {
      return NextResponse.json({ message: 'version and toStatus are required' }, { status: 400 });
    }
    if (!(ACTION_ITEM_STATUSES as readonly string[]).includes(body.toStatus)) {
      return NextResponse.json({ message: `toStatus must be one of ${ACTION_ITEM_STATUSES.join(', ')}` }, { status: 400 });
    }

    const actionItem = await changeActionItemStatus(
      id,
      body.toStatus as ActionItemStatus,
      Number(body.version),
      currentUserId(session),
      {
        hasAssign: checkPermission(session, 'assign_action_items'),
        hasManageOwn: checkPermission(session, 'manage_own_action_items'),
        hasVerify: checkPermission(session, 'verify_action_items'),
        hasClose: checkPermission(session, 'close_action_items'),
        hasReopen: checkPermission(session, 'reopen_action_items'),
      },
      body.remarks || null
    );

    return NextResponse.json(actionItem);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ForbiddenTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof InvalidStatusTransitionError || error instanceof DependencyNotSatisfiedError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/action-items/[id]/status error:', error);
    return NextResponse.json({ message: error.message || 'Failed to change action item status' }, { status: 400 });
  }
}
