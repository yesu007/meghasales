import { NextRequest, NextResponse } from 'next/server';
import { isPayrollModuleEnabled } from '@/lib/payroll/featureFlag';
import { syncAttendanceFromSftp } from '@/lib/payroll/attendanceSftp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Triggered by the Vercel Cron job in vercel.json — same CRON_SECRET
// bearer-check pattern as the reminder cron routes. Pulls any new Access
// Control attendance log from SFTP and imports it.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('GET /api/payroll/attendance/imports/cron: CRON_SECRET is not configured');
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  if (!isPayrollModuleEnabled()) return NextResponse.json({ skipped: 'Payroll module is disabled' });

  try {
    const result = await syncAttendanceFromSftp();
    if (!result.configured) return NextResponse.json({ skipped: 'ATTENDANCE_SFTP_* is not configured' });
    console.log(`Attendance SFTP cron: ${result.files.map((f) => `${f.fileName}=${f.result}`).join(', ') || 'no log files found'}`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET /api/payroll/attendance/imports/cron error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
