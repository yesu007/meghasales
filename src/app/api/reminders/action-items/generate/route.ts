import { NextRequest, NextResponse } from 'next/server';
import { dispatchActionItemReminders } from '@/lib/meetings/actionItemReminderDispatcher';

export const dynamic = 'force-dynamic';

// Triggered daily by the Vercel Cron job in vercel.json — same CRON_SECRET
// bearer-check pattern as /api/reminders/deadlines/generate and
// /api/admin-ticket/reminders/generate. Vercel Hobby crons only run once a
// day, so GET /api/action-items also calls dispatchActionItemReminders()
// on-demand (see that route) to catch anything due between cron ticks.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('GET /api/reminders/action-items/generate: CRON_SECRET is not configured');
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchActionItemReminders();
    console.log(`Action item reminders cron: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped (of ${result.processed} due)`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET /api/reminders/action-items/generate error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
