import { NextRequest, NextResponse } from 'next/server';
import { generateDueReminders } from '@/lib/reminderGeneration';

export const dynamic = 'force-dynamic';

// Triggered daily by the Vercel Cron job defined in vercel.json. Vercel
// automatically sends `Authorization: Bearer <CRON_SECRET>` when invoking
// scheduled routes if a CRON_SECRET env var is set on the project — fail
// closed (500) if it isn't configured yet, rather than running unprotected.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('GET /api/accounting/reminders/generate: CRON_SECRET is not configured');
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await generateDueReminders();
    console.log(`Reminder generation cron: created ${result.created} reminder(s)`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET /api/accounting/reminders/generate error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
