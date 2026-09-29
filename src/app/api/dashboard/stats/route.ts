import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOwnershipFilter, requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

// Dashboard KPI cards. Gated by view_dashboard alone, so every role that
// can open the Dashboard sees real counts, instead of the page calling the
// Leads/Quotations/Demos/Implementations list APIs, each of which needs its
// own view_* permission (a role without them got zeros and error toasts).
// The where-clauses mirror those list endpoints' defaults so the numbers
// match what each module shows:
//   - leads: excludes leadSource QUOTATION placeholders (GET /api/leads)
//   - quotations: DRAFT + SENT
//   - demos: SCHEDULED + RESCHEDULED, DEMO_TEAM scoped to their own
//     (same getOwnershipFilter as GET /api/demos)
//   - implementations: all
export async function GET() {
  const denied = await requirePermission('view_dashboard');
  if (denied) return denied;

  try {
    const demoOwnership = await getOwnershipFilter('assignedToId', ['DEMO_TEAM']);

    const [totalLeads, activeQuotations, scheduledDemos, implementations] = await Promise.all([
      prisma.lead.count({ where: { leadSource: { not: 'QUOTATION' } } }),
      prisma.quotation.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
      prisma.demo.count({ where: { AND: [{ status: { in: ['SCHEDULED', 'RESCHEDULED'] } }, ...(demoOwnership ? [demoOwnership] : [])] } }),
      prisma.implementation.count(),
    ]);

    return NextResponse.json({ totalLeads, activeQuotations, scheduledDemos, implementations });
  } catch (error) {
    console.error('GET /api/dashboard/stats error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
