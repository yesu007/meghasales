import { NextRequest, NextResponse } from 'next/server';
import { dispatchDeadlineReminders } from '@/lib/deadlineReminders';

export const dynamic = 'force-dynamic';

// Triggered daily by the Vercel Cron job in vercel.json — same CRON_SECRET
// bearer-check pattern as /api/accounting/reminders/generate and
// /api/admin-ticket/reminders/generate. Vercel Hobby crons only run once a
// day, so GET /api/leads also calls dispatchDeadlineReminders() on-demand
// (see that route) to catch anything that crosses the 24h email threshold
// between cron ticks.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('GET /api/reminders/deadlines/generate: CRON_SECRET is not configured');
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchDeadlineReminders();
    console.log(`Deadline reminders cron: ${result.notified} notified, ${result.emailed} emailed, ${result.emailFailed} email failures`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET /api/reminders/deadlines/generate error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
