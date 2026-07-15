import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import dayjs from 'dayjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const today = dayjs().startOf('day').toDate();
    const weekEnd = dayjs().add(7, 'day').endOf('day').toDate();
    const sixMonthsAgo = dayjs().subtract(5, 'month').startOf('month').toDate();
    const thirtyDaysAgo = dayjs().subtract(29, 'day').startOf('day').toDate();

    const [
      totalInvoicesAgg,
      openInvoices,
      overdueAgg,
      dueTodayAgg,
      dueThisWeekAgg,
      statusCounts,
      outstandingByCustomer,
      monthlyPayments,
      dailyPayments,
    ] = await Promise.all([
      // Total Invoices / Total Invoice Value / Amount Received
      prisma.invoice.aggregate({
        where: { deletedAt: null },
        _count: true,
        _sum: { totalAmount: true, amountPaid: true },
      }),
      // Outstanding Amount = balance across everything not cancelled
      prisma.invoice.aggregate({
        where: { deletedAt: null, status: { not: 'CANCELLED' } },
        _sum: { balanceDue: true },
      }),
      // Overdue Amount
      prisma.invoice.aggregate({
        where: { deletedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { lt: today } },
        _sum: { balanceDue: true },
      }),
      // Due Today
      prisma.invoice.aggregate({
        where: { deletedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { gte: today, lt: dayjs(today).add(1, 'day').toDate() } },
        _sum: { balanceDue: true },
      }),
      // Due This Week (next 7 days, inclusive of today)
      prisma.invoice.aggregate({
        where: { deletedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { gte: today, lte: weekEnd } },
        _sum: { balanceDue: true },
      }),
      // Invoice Status Distribution
      prisma.invoice.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      // Outstanding by Customer (top 10)
      prisma.invoice.groupBy({
        by: ['leadId'],
        where: { deletedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] } },
        _sum: { balanceDue: true },
        orderBy: { _sum: { balanceDue: 'desc' } },
        take: 10,
      }),
      // Monthly Collections (last 6 months)
      prisma.payment.findMany({
        where: { deletedAt: null, paymentDate: { gte: sixMonthsAgo } },
        select: { amount: true, paymentDate: true },
      }),
      // Payment Trend (last 30 days)
      prisma.payment.findMany({
        where: { deletedAt: null, paymentDate: { gte: thirtyDaysAgo } },
        select: { amount: true, paymentDate: true },
      }),
    ]);

    const totalInvoiceValue = Number(totalInvoicesAgg._sum.totalAmount) || 0;
    const amountReceived = Number(totalInvoicesAgg._sum.amountPaid) || 0;
    const outstandingAmount = Number(openInvoices._sum.balanceDue) || 0;
    const overdueAmount = Number(overdueAgg._sum.balanceDue) || 0;
    const dueToday = Number(dueTodayAgg._sum.balanceDue) || 0;
    const dueThisWeek = Number(dueThisWeekAgg._sum.balanceDue) || 0;
    const collectionPercentage = totalInvoiceValue > 0 ? (amountReceived / totalInvoiceValue) * 100 : 0;

    // Overdue is computed, not stored, so split the PENDING/PARTIALLY_PAID
    // buckets from groupBy into their overdue vs not-yet-due portions.
    const overdueCount = await prisma.invoice.count({
      where: { deletedAt: null, status: { in: ['PENDING', 'PARTIALLY_PAID'] }, dueDate: { lt: today } },
    });
    const statusDistribution: { status: string; count: number }[] = [];
    let pendingRemaining = 0;
    for (const s of statusCounts) {
      if (s.status === 'PENDING' || s.status === 'PARTIALLY_PAID') pendingRemaining += s._count;
      else statusDistribution.push({ status: s.status, count: s._count });
    }
    if (pendingRemaining - overdueCount > 0) statusDistribution.push({ status: 'PENDING', count: pendingRemaining - overdueCount });
    if (overdueCount > 0) statusDistribution.push({ status: 'OVERDUE', count: overdueCount });

    const leadIds = outstandingByCustomer.map((r) => r.leadId);
    const leads = leadIds.length > 0 ? await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, companyName: true } }) : [];
    const leadNameById = new Map(leads.map((l) => [l.id, l.companyName]));
    const outstandingByCustomerChart = outstandingByCustomer.map((r) => ({
      customer: leadNameById.get(r.leadId) || `Lead #${r.leadId}`,
      outstanding: Number(r._sum.balanceDue) || 0,
    }));

    // Bucket payments by month for the last 6 months
    const monthBuckets: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) monthBuckets[dayjs().subtract(i, 'month').format('MMM YYYY')] = 0;
    for (const p of monthlyPayments) {
      const key = dayjs(p.paymentDate).format('MMM YYYY');
      if (key in monthBuckets) monthBuckets[key] += Number(p.amount);
    }
    const monthlyCollections = Object.entries(monthBuckets).map(([month, amount]) => ({ month, amount }));

    // Bucket payments by day for the last 30 days
    const dayBuckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) dayBuckets[dayjs().subtract(i, 'day').format('DD MMM')] = 0;
    for (const p of dailyPayments) {
      const key = dayjs(p.paymentDate).format('DD MMM');
      if (key in dayBuckets) dayBuckets[key] += Number(p.amount);
    }
    const paymentTrend = Object.entries(dayBuckets).map(([date, amount]) => ({ date, amount }));

    return NextResponse.json({
      kpis: {
        totalInvoices: totalInvoicesAgg._count,
        totalInvoiceValue,
        amountReceived,
        outstandingAmount,
        overdueAmount,
        dueToday,
        dueThisWeek,
        collectionPercentage,
      },
      charts: {
        monthlyCollections,
        outstandingByCustomer: outstandingByCustomerChart,
        statusDistribution,
        paymentTrend,
      },
    });
  } catch (error: any) {
    console.error('GET /api/accounting/dashboard-stats error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
