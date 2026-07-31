import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createAssistantTool } from '../registry';

export const readDashboardStats = createAssistantTool({
  description: 'Get a high-level pipeline snapshot: lead counts by status, upcoming demos, and quotations awaiting a decision.',
  permission: 'view_leads',
  inputSchema: z.object({}),
  handler: async () => {
    const [leadsByStatus, upcomingDemos, openQuotations] = await Promise.all([
      // Quotations without a picked lead auto-create a leadSource: 'QUOTATION'
      // placeholder lead (see src/app/api/leads/route.ts) — excluded here for
      // the same reason it's excluded from the default lead listing there.
      prisma.lead.groupBy({ by: ['status'], where: { leadSource: { not: 'QUOTATION' } }, _count: true }),
      prisma.demo.count({ where: { status: 'SCHEDULED', scheduledDate: { gte: new Date() } } }),
      prisma.quotation.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
    ]);

    return {
      leadsByStatus: leadsByStatus.map((row) => ({ status: row.status, count: row._count })),
      totalLeads: leadsByStatus.reduce((sum, row) => sum + row._count, 0),
      upcomingDemos,
      openQuotations,
    };
  },
});
