import { z } from 'zod';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createAssistantTool } from '../registry';

// Pure aggregation, factored out so it's testable without a DB (matches this
// repo's convention in e.g. src/lib/taxCalculation.ts) — a customer's open
// balance in more than one currency must never be summed into one
// meaningless blended total.
export function summarizeByCurrency(rows: { currencyCode: string | null; balanceDue: number | string | Prisma.Decimal }[]): Record<string, number> {
  const totalsByCurrency: Record<string, number> = {};
  for (const row of rows) {
    const code = row.currencyCode || 'INR';
    totalsByCurrency[code] = (totalsByCurrency[code] || 0) + Number(row.balanceDue);
  }
  return totalsByCurrency;
}

export const readPendingInvoices = createAssistantTool({
  description: 'List invoices that are pending or partially paid, with total counts and balance due grouped by currency.',
  permission: 'view_accounting',
  inputSchema: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Max number of individual invoices to return, defaults to 5'),
  }),
  handler: async ({ limit }) => {
    const openWhere: Prisma.InvoiceWhereInput = { deletedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] } };

    const [invoices, allOpen] = await Promise.all([
      prisma.invoice.findMany({
        where: openWhere,
        orderBy: { dueDate: 'asc' },
        take: limit ?? 5,
        include: { lead: { select: { companyName: true } } },
      }),
      prisma.invoice.findMany({ where: openWhere, select: { currencyCode: true, balanceDue: true } }),
    ]);

    return {
      totalCount: allOpen.length,
      totalsByCurrency: summarizeByCurrency(allOpen),
      invoices: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        companyName: inv.lead.companyName,
        dueDate: inv.dueDate,
        balanceDue: Number(inv.balanceDue),
        currencyCode: inv.currencyCode,
        status: inv.status,
      })),
    };
  },
});
