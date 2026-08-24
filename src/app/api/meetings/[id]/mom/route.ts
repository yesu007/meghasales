import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { createMom, MomAlreadyExistsError } from '@/lib/meetings/momService';

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
    const meetingId = parseInt(params.id);
    const body = await request.json();
    const session = await getServerSession(authOptions);

    const mom = await createMom(meetingId, { summary: body.summary || null, risksIssues: body.risksIssues || null }, currentUserId(session));

    return NextResponse.json(mom, { status: 201 });
  } catch (error: any) {
    if (error instanceof MomAlreadyExistsError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error('POST /api/meetings/[id]/mom error:', error);
    return NextResponse.json({ message: error.message || 'Failed to create MOM' }, { status: 400 });
  }
}
