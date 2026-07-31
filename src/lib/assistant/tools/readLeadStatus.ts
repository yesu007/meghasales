import { z } from 'zod';
import prisma from '@/lib/prisma';
import { createAssistantTool } from '../registry';

export const readLeadStatus = createAssistantTool({
  description: "Look up a lead's current status, assigned business analyst, and most recent activity by company name.",
  permission: 'view_leads',
  inputSchema: z.object({
    companyName: z.string().describe('Company name to search for, e.g. "Acme Jewellers". Partial, case-insensitive matches are fine.'),
  }),
  handler: async ({ companyName }) => {
    const lead = await prisma.lead.findFirst({
      where: { companyName: { contains: companyName, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedBa: { select: { firstName: true, lastName: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!lead) {
      return { found: false as const, companyName };
    }

    return {
      found: true as const,
      id: lead.id,
      companyName: lead.companyName,
      contactPerson: lead.contactPerson,
      status: lead.status,
      leadSource: lead.leadSource,
      assignedBaName: lead.assignedBa ? `${lead.assignedBa.firstName} ${lead.assignedBa.lastName}` : null,
      lastActivity: lead.activities[0]?.description ?? null,
      lastActivityAt: lead.activities[0]?.createdAt ?? null,
    };
  },
});
