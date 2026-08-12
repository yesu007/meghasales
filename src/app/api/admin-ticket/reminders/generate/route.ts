import { NextRequest, NextResponse } from 'next/server';
import { isAdminTicketModuleEnabled } from '@/lib/adminTicket/featureFlag';
import { generateDueOccurrences } from '@/lib/adminTicket/recurrenceGeneration';
import { dispatchDueReminders } from '@/lib/adminTicket/dispatcher';

export const dynamic = 'force-dynamic';

// Triggered daily by the Vercel Cron job in vercel.json — same
// CRON_SECRET bearer-check pattern as /api/accounting/reminders/generate.
// Combines recurrence generation (create the next occurrence for any due
// recurring ticket) and reminder dispatch (send whatever's due) into one
// daily job so the module needs only one cron slot; the tickets list also
// calls dispatchDueReminders() on-demand, so a missed cron tick isn't the
// only chance for a reminder to go out.
export async function GET(request: NextRequest) {
  if (!isAdminTicketModuleEnabled()) return NextResponse.json({ message: 'Not found' }, { status: 404 });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('GET /api/admin-ticket/reminders/generate: CRON_SECRET is not configured');
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const recurrenceResult = await generateDueOccurrences();
    const dispatchResult = await dispatchDueReminders();
    console.log(
      `Admin ticket cron: generated ${recurrenceResult.generated} occurrence(s), ` +
        `dispatched ${dispatchResult.sent} reminder(s) (${dispatchResult.pushed} push), ${dispatchResult.failed} failed, ${dispatchResult.skipped} skipped`
    );
    return NextResponse.json({ ...recurrenceResult, ...dispatchResult });
  } catch (error: any) {
    console.error('GET /api/admin-ticket/reminders/generate error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
