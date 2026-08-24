import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { approveMom, rejectMom, OptimisticLockError, InvalidStatusTransitionError } from '@/lib/meetings/momService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// One endpoint for both outcomes ({ decision: 'APPROVED' | 'REJECTED' }) —
// both require the same approve_mom permission and act on the same
// SUBMITTED-only precondition, so splitting into /approve and /reject would
// just duplicate the guard clauses.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('approve_mom');
  if (denied) return denied;

  try {
    const momId = parseInt(params.id);
    const body = await request.json();
    if (body.version == null) {
      return NextResponse.json({ message: 'version is required for optimistic-lock updates' }, { status: 400 });
    }
    if (body.decision !== 'APPROVED' && body.decision !== 'REJECTED') {
      return NextResponse.json({ message: 'decision must be APPROVED or REJECTED' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const performedById = currentUserId(session);

    const mom =
      body.decision === 'APPROVED'
        ? await approveMom(momId, Number(body.version), performedById, body.remarks || null)
        : await rejectMom(momId, Number(body.version), performedById, body.remarks || null);

    return NextResponse.json(mom);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/mom/[id]/approve error:', error);
    return NextResponse.json({ message: error.message || 'Failed to record MOM approval decision' }, { status: 400 });
  }
}
