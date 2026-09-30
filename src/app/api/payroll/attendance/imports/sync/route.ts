import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { syncAttendanceFromSftp } from '@/lib/payroll/attendanceSftp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// "Sync now" — same SFTP pull the cron runs, on demand.
export async function POST(_request: NextRequest) {
  if (!isPayrollModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  const denied = await requirePermission('create_timesheet');
  if (denied) return denied;

  try {
    const session = await getServerSession(authOptions);
    const createdById = session?.user ? parseInt((session.user as any).id, 10) : null;
    const result = await syncAttendanceFromSftp(Number.isFinite(createdById) ? createdById : null);
    if (!result.configured) return NextResponse.json({ message: 'SFTP is not configured — set the ATTENDANCE_SFTP_* environment variables' }, { status: 503 });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('POST /api/payroll/attendance/imports/sync error:', error);
    return NextResponse.json({ message: `SFTP sync failed: ${error.message || 'unknown error'}` }, { status: 502 });
  }
}
