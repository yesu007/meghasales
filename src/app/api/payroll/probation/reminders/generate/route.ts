import { NextRequest, NextResponse } from 'next/server';
import { dispatchProbationReminders } from '@/lib/probationReminders';

export const dynamic = 'force-dynamic';

// Triggered daily by the Vercel Cron job in vercel.json — same CRON_SECRET
// bearer-check pattern as /api/reminders/deadlines/generate and the other
// reminder cron routes.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('GET /api/payroll/probation/reminders/generate: CRON_SECRET is not configured');
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchProbationReminders();
    console.log(`Probation reminders cron: ${result.notified} notification(s) sent across ${result.employeesProcessed} employee stage(s)`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET /api/payroll/probation/reminders/generate error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
