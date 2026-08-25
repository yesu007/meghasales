import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { checkPermission, requirePermission } from '@/lib/rbac';
import { isMeetingsModuleEnabled } from '@/lib/meetings/featureFlag';
import { getIndividualDashboard, getManagementDashboard, getTeamDashboard } from '@/lib/meetings/dashboardService';

export const dynamic = 'force-dynamic';

function currentUserId(session: any): number | null {
  const id = session?.user ? parseInt(session.user.id, 10) : NaN;
  return Number.isFinite(id) ? id : null;
}

// Tiers are additive, not exclusive: every caller with view_meetings gets
// their individual dashboard; holding view_meeting_team_dashboard also adds
// a team block scoped to the caller's own Employee.department (no manager/
// reports-to relationship exists in this schema — see the Meeting Lifecycle
// Blueprint §07/§12 assumptions); holding view_meeting_reports also adds the
// org-wide management block. A user can hold more than one tier at once.
export async function GET(request: NextRequest) {
  if (!isMeetingsModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('view_meetings');
  if (denied) return denied;

  try {
    const session = await getServerSession(authOptions);
    const userId = currentUserId(session);
    if (userId == null) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const individual = await getIndividualDashboard(userId);

    let team = null;
    if (checkPermission(session, 'view_meeting_team_dashboard')) {
      const employee = await prisma.employee.findUnique({ where: { userId }, select: { department: true } });
      if (employee?.department) team = await getTeamDashboard(employee.department);
    }

    let management = null;
    if (checkPermission(session, 'view_meeting_reports')) {
      management = await getManagementDashboard();
    }

    return NextResponse.json({ individual, team, management });
  } catch (error) {
    console.error('GET /api/meetings/dashboard error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
