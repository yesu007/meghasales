import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { addMomDecision, MomNotEditableError } from '@/lib/meetings/momService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_mom');
  if (denied) return denied;

  try {
    const momId = parseInt(params.id);
    const body = await request.json();
    if (!body.decisionText) {
      return NextResponse.json({ message: 'decisionText is required' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const decision = await addMomDecision(momId, body.decisionText, body.sortOrder != null ? Number(body.sortOrder) : undefined, currentUserId(session));

    return NextResponse.json(decision, { status: 201 });
  } catch (error: any) {
    if (error instanceof MomNotEditableError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('POST /api/mom/[id]/decisions error:', error);
    return NextResponse.json({ message: error.message || 'Failed to add decision' }, { status: 400 });
  }
}
