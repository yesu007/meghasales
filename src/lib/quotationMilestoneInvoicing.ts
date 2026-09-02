import dayjs from 'dayjs';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { nextInvoiceNumber } from '@/lib/invoiceFromQuotation';
import { materializeMilestonePlan, type MilestonePlanInput } from '@/lib/quotationMilestones';

// One line item per milestone invoice — a full resource/cost breakdown (like
// the lump-sum invoice gets via lineItemsFromQuotation) would repeat the same
// breakdown across every milestone invoice for the same quotation, which
// reads as confusing rather than useful; a milestone invoice is a percentage
// slice of the already-quoted total, not a separate costing exercise.
function milestoneLineItem(quotation: { quotationNumber: string }, sequence: number, totalMilestones: number, percentage: number, amount: number) {
  return [{
    description: `Milestone ${sequence} of ${totalMilestones} (${percentage}%) — Quotation ${quotation.quotationNumber}`,
    quantity: 1,
    unitPrice: amount,
    total: amount,
  }];
}

async function createMilestoneInvoice(
  tx: Prisma.TransactionClient,
  quotation: { id: number; quotationNumber: string; leadId: number; legalEntityId: number | null; currencyCode: string | null; exchangeRate: any },
  milestone: { sequence: number; percentage: number; amount: number },
  totalMilestones: number,
) {
  const invoiceNumber = await nextInvoiceNumber(tx);
  const invoiceDate = new Date();
  return tx.invoice.create({
    data: {
      invoiceNumber,
      leadId: quotation.leadId,
      quotationId: quotation.id,
      legalEntityId: quotation.legalEntityId,
      invoiceDate,
      dueDate: dayjs(invoiceDate).add(30, 'day').toDate(),
      lineItems: milestoneLineItem(quotation, milestone.sequence, totalMilestones, milestone.percentage, milestone.amount),
      subtotal: milestone.amount,
      totalAmount: milestone.amount,
      amountPaid: 0,
      balanceDue: milestone.amount,
      currencyCode: quotation.currencyCode || 'INR',
      exchangeRate: quotation.exchangeRate || 1,
    },
    include: { lead: { select: { companyName: true } } },
  });
}

// Called once, at the moment a quotation transitions to APPROVED (see PUT
// /api/quotations/[id]) — turns the {percentage, gapDays} plan the user
// configured (Quotation.pricingSnapshot.paymentMilestones) into dated
// QuotationPaymentMilestone rows, and immediately invoices milestone 1 (it's
// always due "now" — see quotationMilestones.ts). The rest stay PENDING for
// the daily cron (generateDueMilestoneInvoices) to pick up as they come due.
export async function materializeQuotationMilestones(
  tx: Prisma.TransactionClient,
  quotation: { id: number; quotationNumber: string; leadId: number; legalEntityId: number | null; currencyCode: string | null; exchangeRate: any; totalAmount: any },
  plan: MilestonePlanInput[],
) {
  const approvalDate = new Date();
  const schedule = materializeMilestonePlan(plan, Number(quotation.totalAmount) || 0, approvalDate);

  let firstInvoice = null;
  for (const m of schedule) {
    const isFirst = m.sequence === 1;
    const invoice = isFirst ? await createMilestoneInvoice(tx, quotation, m, schedule.length) : null;
    await tx.quotationPaymentMilestone.create({
      data: {
        quotationId: quotation.id,
        sequence: m.sequence,
        percentage: m.percentage,
        amount: m.amount,
        gapDays: m.gapDays,
        scheduledDate: m.scheduledDate,
        status: isFirst ? 'INVOICED' : 'PENDING',
        invoiceId: invoice?.id ?? null,
      },
    });
    if (isFirst) firstInvoice = invoice;
  }

  return { firstInvoice };
}

// Daily cron entry point (GET /api/quotations/milestones/generate) — same
// shape/idempotency convention as generateDueReminders: a plain loop, safe
// to call repeatedly since a milestone only ever gets invoiced once
// (guarded by the PENDING status check in the query itself).
export async function generateDueMilestoneInvoices(): Promise<{ created: number }> {
  const due = await prisma.quotationPaymentMilestone.findMany({
    where: {
      status: 'PENDING',
      scheduledDate: { lte: new Date() },
      quotation: { status: 'APPROVED' },
    },
    include: {
      quotation: { select: { id: true, quotationNumber: true, leadId: true, legalEntityId: true, currencyCode: true, exchangeRate: true, _count: { select: { paymentMilestones: true } } } },
    },
  });

  let created = 0;
  for (const milestone of due) {
    await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: two overlapping cron runs (or a
      // manual retry) could both have read this row as PENDING before
      // either updated it.
      const current = await tx.quotationPaymentMilestone.findUnique({ where: { id: milestone.id } });
      if (!current || current.status !== 'PENDING') return;

      const invoice = await createMilestoneInvoice(
        tx,
        milestone.quotation,
        { sequence: milestone.sequence, percentage: Number(milestone.percentage), amount: Number(milestone.amount) },
        milestone.quotation._count.paymentMilestones,
      );
      await tx.quotationPaymentMilestone.update({ where: { id: milestone.id }, data: { status: 'INVOICED', invoiceId: invoice.id } });
      created += 1;
    });
  }

  return { created };
}
