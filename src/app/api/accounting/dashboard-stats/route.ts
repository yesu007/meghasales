import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import dayjs from 'dayjs';
import { requirePermission } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  const denied = await requirePermission('view_accounting');
  if (denied) return denied;
  try {
    const today = dayjs().startOf('day').toDate();
    const tomorrow = dayjs(today).add(1, 'day').toDate();
    const weekEnd = dayjs().add(7, 'day').endOf('day').toDate();
    const sixMonthsAgo = dayjs().subtract(5, 'month').startOf('month').toDate();
    const thirtyDaysAgo = dayjs().subtract(29, 'day').startOf('day').toDate();

    const [invoices, statusCounts, monthlyPayments, dailyPayments] = await Promise.all([
      // Fetched once and reduced in JS below (grouped by currency) rather
      // than five separate Prisma aggregate() calls — a customer's/company's
      // invoices in more than one currency must never be summed into one
      // meaningless blended KPI number.
      prisma.invoice.findMany({
        where: { deletedAt: null },
        select: { currencyCode: true, totalAmount: true, amountPaid: true, balanceDue: true, status: true, dueDate: true, leadId: true },
      }),
      // Invoice Status Distribution (counts only, currency-independent)
      prisma.invoice.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      // Monthly Collections (last 6 months)
      prisma.payment.findMany({
        where: { deletedAt: null, paymentDate: { gte: sixMonthsAgo } },
        select: { amount: true, paymentDate: true, invoice: { select: { currencyCode: true } } },
      }),
      // Payment Trend (last 30 days)
      prisma.payment.findMany({
        where: { deletedAt: null, paymentDate: { gte: thirtyDaysAgo } },
        select: { amount: true, paymentDate: true, invoice: { select: { currencyCode: true } } },
      }),
    ]);

    const currencyCodes = Array.from(new Set(invoices.map((i) => i.currencyCode || 'INR')));
    const kpisByCurrency = currencyCodes.map((currencyCode) => {
      const rows = invoices.filter((i) => (i.currencyCode || 'INR') === currencyCode);
      const openRows = rows.filter((i) => i.status === 'PENDING' || i.status === 'PARTIALLY_PAID');
      const totalInvoiceValue = rows.reduce((s, i) => s + Number(i.totalAmount), 0);
      const amountReceived = rows.reduce((s, i) => s + Number(i.amountPaid), 0);
      return {
        currencyCode,
        totalInvoices: rows.length,
        totalInvoiceValue,
        amountReceived,
        outstandingAmount: rows.filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + Number(i.balanceDue), 0),
        overdueAmount: openRows.filter((i) => i.dueDate < today).reduce((s, i) => s + Number(i.balanceDue), 0),
        dueToday: openRows.filter((i) => i.dueDate >= today && i.dueDate < tomorrow).reduce((s, i) => s + Number(i.balanceDue), 0),
        dueThisWeek: openRows.filter((i) => i.dueDate >= today && i.dueDate <= weekEnd).reduce((s, i) => s + Number(i.balanceDue), 0),
        collectionPercentage: totalInvoiceValue > 0 ? (amountReceived / totalInvoiceValue) * 100 : 0,
      };
    }).sort((a, b) => b.totalInvoiceValue - a.totalInvoiceValue);

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

    // Outstanding by Customer (top 10) — grouped by (customer, currency) so
    // a customer with open invoices in more than one currency shows as
    // separate bars instead of one blended total.
    const openInvoices = invoices.filter((i) => i.status === 'PENDING' || i.status === 'PARTIALLY_PAID');
    const byCustomerCurrency: Record<string, { leadId: number; currencyCode: string; outstanding: number }> = {};
    for (const inv of openInvoices) {
      const currencyCode = inv.currencyCode || 'INR';
      const k = `${inv.leadId} ${currencyCode}`;
      if (!byCustomerCurrency[k]) byCustomerCurrency[k] = { leadId: inv.leadId, currencyCode, outstanding: 0 };
      byCustomerCurrency[k].outstanding += Number(inv.balanceDue);
    }
    const topOutstanding = Object.values(byCustomerCurrency).sort((a, b) => b.outstanding - a.outstanding).slice(0, 10);
    const leadIds = topOutstanding.map((r) => r.leadId);
    const leads = leadIds.length > 0 ? await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, companyName: true } }) : [];
    const leadNameById = new Map(leads.map((l) => [l.id, l.companyName]));
    const outstandingByCustomerChart = topOutstanding.map((r) => ({
      customer: leadNameById.get(r.leadId) || `Lead #${r.leadId}`,
      currencyCode: r.currencyCode,
      outstanding: r.outstanding,
    }));

    // Monthly Collections / Payment Trend: true multi-currency time-series
    // charting (grouped/stacked bars per currency) is out of scope for this
    // cleanup — these two trend charts keep summing across currencies as
    // they always did, but now format using the dashboard's dominant
    // currency (by total invoice value) instead of a hardcoded ₹, so at
    // least the common single-currency case (all data today) renders
    // correctly instead of mislabeling non-INR amounts.
    const primaryCurrencyCode = kpisByCurrency[0]?.currencyCode || 'INR';

    const monthBuckets: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) monthBuckets[dayjs().subtract(i, 'month').format('MMM YYYY')] = 0;
    for (const p of monthlyPayments) {
      const key = dayjs(p.paymentDate).format('MMM YYYY');
      if (key in monthBuckets) monthBuckets[key] += Number(p.amount);
    }
    const monthlyCollections = Object.entries(monthBuckets).map(([month, amount]) => ({ month, amount }));

    const dayBuckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) dayBuckets[dayjs().subtract(i, 'day').format('DD MMM')] = 0;
    for (const p of dailyPayments) {
      const key = dayjs(p.paymentDate).format('DD MMM');
      if (key in dayBuckets) dayBuckets[key] += Number(p.amount);
    }
    const paymentTrend = Object.entries(dayBuckets).map(([date, amount]) => ({ date, amount }));

    return NextResponse.json({
      kpisByCurrency,
      primaryCurrencyCode,
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
