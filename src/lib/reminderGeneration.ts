import prisma from '@/lib/prisma';
import { matchReminderThreshold } from '@/lib/accounting';

// Shared by both the on-demand refresh in GET /api/accounting/reminders
// (so the page is useful without waiting for a cron run) and the scheduled
// cron route (Phase 7). Idempotent via PaymentReminder's unique
// [invoiceId, reminderType] constraint — safe to call repeatedly in a day.
export async function generateDueReminders(): Promise<{ created: number }> {
  const openInvoices = await prisma.invoice.findMany({
    where: { deletedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
    select: { id: true, dueDate: true },
  });

  let created = 0;
  for (const invoice of openInvoices) {
    const reminderType = matchReminderThreshold(invoice.dueDate);
    if (!reminderType) continue;

    const existing = await prisma.paymentReminder.findUnique({
      where: { invoiceId_reminderType: { invoiceId: invoice.id, reminderType } },
    });
    if (existing) continue;

    await prisma.paymentReminder.create({ data: { invoiceId: invoice.id, reminderType } });
    created += 1;
  }

  return { created };
}
