import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { updateMomContent, OptimisticLockError, MomNotEditableError } from '@/lib/meetings/momService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_meetings');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const mom = await prisma.mom.findUnique({
      where: { id },
      include: { decisions: { orderBy: { sortOrder: 'asc' } }, versions: { orderBy: { versionNumber: 'desc' } } },
    });
    if (!mom) return NextResponse.json({ message: 'MOM not found' }, { status: 404 });

    const userIds = Array.from(
      new Set([mom.createdById, mom.approvedById, ...mom.decisions.map((d) => d.decidedById), ...mom.versions.map((v) => v.editedById)].filter((v): v is number => v != null))
    );
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const userName = (uid: number | null) => {
      if (uid == null) return null;
      const u = users.find((x) => x.id === uid);
      return u ? `${u.firstName} ${u.lastName}` : null;
    };

    return NextResponse.json({
      ...mom,
      createdByName: userName(mom.createdById),
      approvedByName: userName(mom.approvedById),
      decisions: mom.decisions.map((d) => ({ ...d, decidedByName: userName(d.decidedById) })),
      versions: mom.versions.map((v) => ({ ...v, editedByName: userName(v.editedById) })),
    });
  } catch (error) {
    console.error('GET /api/mom/[id] error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('manage_mom');
  if (denied) return denied;

  try {
    const id = parseInt(params.id);
    const body = await request.json();
    if (body.version == null) {
      return NextResponse.json({ message: 'version is required for optimistic-lock updates' }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const mom = await updateMomContent(id, {
      version: Number(body.version),
      performedById: currentUserId(session),
      summary: body.summary !== undefined ? body.summary || null : undefined,
      risksIssues: body.risksIssues !== undefined ? body.risksIssues || null : undefined,
    });

    return NextResponse.json(mom);
  } catch (error: any) {
    if (error instanceof OptimisticLockError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof MomNotEditableError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('PATCH /api/mom/[id] error:', error);
    return NextResponse.json({ message: error.message || 'Failed to update MOM' }, { status: 400 });
  }
}
