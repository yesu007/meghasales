import { NextRequest, NextResponse } from 'next/server';
import { generateDueMilestoneInvoices } from '@/lib/quotationMilestoneInvoicing';

export const dynamic = 'force-dynamic';

// Triggered daily by the Vercel Cron job defined in vercel.json — same
// CRON_SECRET bearer-auth convention as the other generate routes (e.g.
// /api/accounting/reminders/generate). Invoices every PENDING payment
// milestone whose scheduledDate has arrived on an APPROVED quotation.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('GET /api/quotations/milestones/generate: CRON_SECRET is not configured');
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await generateDueMilestoneInvoices();
    console.log(`Milestone invoice generation cron: created ${result.created} invoice(s)`);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('GET /api/quotations/milestones/generate error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
