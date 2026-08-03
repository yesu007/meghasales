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
        select: { paidAmount: true, currencyCode: true, paymentDate: true },
      }),
      // Payment Trend (last 30 days)
      prisma.payment.findMany({
        where: { deletedAt: null, paymentDate: { gte: thirtyDaysAgo } },
        select: { paidAmount: true, currencyCode: true, paymentDate: true },
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

    // Monthly Collections / Payment Trend: grouped by the currency the payer
    // actually paid in (payment.currencyCode / paidAmount), NOT the invoice's
    // billing currency (payment.amount is that currency-converted figure).
    // A payment recorded in USD against an INR invoice must show up as USD
    // received, not get folded into the INR total or dropped because the
    // invoice itself is INR.
    const primaryCurrencyCode = kpisByCurrency[0]?.currencyCode || 'INR';
    const currencyRank = new Map(kpisByCurrency.map((k, i) => [k.currencyCode, i]));
    const byRank = (a: { currencyCode: string }, b: { currencyCode: string }) =>
      (currencyRank.has(a.currencyCode) ? currencyRank.get(a.currencyCode)! : 999) -
      (currencyRank.has(b.currencyCode) ? currencyRank.get(b.currencyCode)! : 999);

    const monthKeys: string[] = [];
    for (let i = 5; i >= 0; i--) monthKeys.push(dayjs().subtract(i, 'month').format('MMM YYYY'));
    const monthlyByCurrency: Record<string, Record<string, number>> = {};
    for (const p of monthlyPayments) {
      const currencyCode = p.currencyCode || 'INR';
      const key = dayjs(p.paymentDate).format('MMM YYYY');
      if (!monthKeys.includes(key)) continue;
      if (!monthlyByCurrency[currencyCode]) monthlyByCurrency[currencyCode] = {};
      monthlyByCurrency[currencyCode][key] = (monthlyByCurrency[currencyCode][key] || 0) + Number(p.paidAmount);
    }
    const monthlyCollectionsByCurrency = Object.entries(monthlyByCurrency)
      .map(([currencyCode, buckets]) => ({
        currencyCode,
        data: monthKeys.map((month) => ({ month, amount: buckets[month] || 0 })),
      }))
      .sort(byRank);

    const dayKeys: string[] = [];
    for (let i = 29; i >= 0; i--) dayKeys.push(dayjs().subtract(i, 'day').format('DD MMM'));
    const dailyByCurrency: Record<string, Record<string, number>> = {};
    for (const p of dailyPayments) {
      const currencyCode = p.currencyCode || 'INR';
      const key = dayjs(p.paymentDate).format('DD MMM');
      if (!dayKeys.includes(key)) continue;
      if (!dailyByCurrency[currencyCode]) dailyByCurrency[currencyCode] = {};
      dailyByCurrency[currencyCode][key] = (dailyByCurrency[currencyCode][key] || 0) + Number(p.paidAmount);
    }
    const paymentTrendByCurrency = Object.entries(dailyByCurrency)
      .map(([currencyCode, buckets]) => ({
        currencyCode,
        data: dayKeys.map((date) => ({ date, amount: buckets[date] || 0 })),
      }))
      .sort(byRank);

    return NextResponse.json({
      kpisByCurrency,
      primaryCurrencyCode,
      charts: {
        monthlyCollectionsByCurrency,
        outstandingByCustomer: outstandingByCustomerChart,
        statusDistribution,
        paymentTrendByCurrency,
      },
    });
  } catch (error: any) {
    console.error('GET /api/accounting/dashboard-stats error:', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
