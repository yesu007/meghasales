import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Dashboard summary widgets for the Leads page: Total New / Pending
// Follow-up / Overdue Follow-ups / Converted this month.
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Quotations created without picking an existing lead auto-create a
    // synthetic lead (leadSource: 'QUOTATION') — excluded here too, matching
    // the default GET /api/leads listing.
    const realLead = { leadSource: { not: 'QUOTATION' } };
    const notTerminal = { status: { notIn: ['CONFIRMED', 'DISQUALIFIED'] } };

    const [totalNew, pendingFollowUp, overdueFollowUp, convertedThisMonth] = await Promise.all([
      prisma.lead.count({ where: { ...realLead, status: 'NEW' } }),
      prisma.lead.count({ where: { ...realLead, ...notTerminal, nextFollowUpDate: { gte: startOfToday } } }),
      prisma.lead.count({ where: { ...realLead, ...notTerminal, nextFollowUpDate: { lt: startOfToday } } }),
      prisma.leadActivity.count({ where: { activityType: 'LEAD_CONFIRMED', createdAt: { gte: startOfMonth } } }),
    ]);

    return NextResponse.json({ totalNew, pendingFollowUp, overdueFollowUp, convertedThisMonth });
  } catch (error) {
    console.error('GET /api/leads/stats error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
