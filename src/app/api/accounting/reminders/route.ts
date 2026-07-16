import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { generateDueReminders } from '@/lib/reminderGeneration';
import { requirePermission } from '@/lib/rbac';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

// Day offset from the due date for each threshold, in escalation order —
// used to compute when the *next* reminder after this one will fire.
const THRESHOLD_OFFSETS: [string, number][] = [
  ['UPCOMING_7D', -7],
  ['DUE_TODAY', 0],
  ['OVERDUE_3D', 3],
  ['OVERDUE_7D', 7],
  ['OVERDUE_15D', 15],
  ['OVERDUE_30D', 30],
];

function nextReminderDate(reminderType: string, dueDate: Date): string | null {
  const idx = THRESHOLD_OFFSETS.findIndex(([type]) => type === reminderType);
  if (idx === -1 || idx === THRESHOLD_OFFSETS.length - 1) return null;
  const [, nextOffset] = THRESHOLD_OFFSETS[idx + 1];
  return dayjs(dueDate).add(nextOffset, 'day').toISOString();
}

export async function GET(request: NextRequest) {
  const denied = await requirePermission('view_accounting');
  if (denied) return denied;
  try {
    // Backfill any reminder thresholds newly crossed since the last visit —
    // keeps this page useful even before the Phase 7 cron job exists, and
    // stays cheap/idempotent thanks to PaymentReminder's unique constraint.
    await generateDueReminders();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '0');
    const size = parseInt(searchParams.get('size') || '20');
    const status = searchParams.get('status') || '';

    const where: Prisma.PaymentReminderWhereInput = {};
    if (status) where.status = status.toUpperCase();

    const [reminders, totalElements] = await Promise.all([
      prisma.paymentReminder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: page * size,
        take: size,
        include: {
          invoice: { select: { invoiceNumber: true, balanceDue: true, dueDate: true, currencyCode: true, lead: { select: { companyName: true } } } },
          followedUpBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.paymentReminder.count({ where }),
    ]);

    const content = reminders.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoice.invoiceNumber,
      companyName: r.invoice.lead.companyName,
      balanceDue: r.invoice.balanceDue,
      currencyCode: r.invoice.currencyCode,
      dueDate: r.invoice.dueDate,
      reminderType: r.reminderType,
      nextReminderDate: nextReminderDate(r.reminderType, r.invoice.dueDate),
      status: r.status,
      notes: r.notes,
      followedUpAt: r.followedUpAt,
      followedUpByName: r.followedUpBy ? `${r.followedUpBy.firstName} ${r.followedUpBy.lastName}` : null,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ content, page, size, totalElements, totalPages: Math.ceil(totalElements / size) });
  } catch (error: any) {
    console.error('GET /api/accounting/reminders error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
