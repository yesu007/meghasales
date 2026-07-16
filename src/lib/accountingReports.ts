import prisma from '@/lib/prisma';
import dayjs from 'dayjs';
import { groupSumsByCurrency } from './reportGrouping';

export type ReportType = 'outstanding' | 'aging' | 'collection' | 'payment-history' | 'overdue' | 'monthly-collection';

export interface ReportColumn { key: string; label: string; align?: 'left' | 'right'; type?: 'currency' | 'number' | 'text' }
export interface ReportResult { title: string; columns: ReportColumn[]; rows: Record<string, any>[] }

interface ReportFilters { from?: string; to?: string; leadId?: string }

export async function buildReport(type: ReportType, filters: ReportFilters): Promise<ReportResult> {
  switch (type) {
    case 'outstanding':
      return buildOutstandingReport(filters);
    case 'overdue':
      return buildOverdueReport(filters);
    case 'aging':
      return buildAgingReport(filters);
    case 'payment-history':
      return buildPaymentHistoryReport(filters);
    case 'collection':
      return buildCollectionReport(filters);
    case 'monthly-collection':
      return buildMonthlyCollectionReport(filters);
    default:
      throw new Error(`Unknown report type: ${type}`);
  }
}

async function buildOutstandingReport(filters: ReportFilters): Promise<ReportResult> {
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      ...(filters.leadId && { leadId: parseInt(filters.leadId) }),
    },
    include: { lead: { select: { companyName: true } } },
    orderBy: { dueDate: 'asc' },
  });

  return {
    title: 'Outstanding Report',
    columns: [
      { key: 'invoiceNumber', label: 'Invoice No' },
      { key: 'companyName', label: 'Customer' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'invoiceDate', label: 'Invoice Date' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'totalAmount', label: 'Total Amount', align: 'right', type: 'currency' },
      { key: 'balanceDue', label: 'Balance Due', align: 'right', type: 'currency' },
      { key: 'status', label: 'Status' },
    ],
    rows: invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      companyName: inv.lead.companyName,
      currencyCode: inv.currencyCode || 'INR',
      invoiceDate: dayjs(inv.invoiceDate).format('DD MMM YYYY'),
      dueDate: dayjs(inv.dueDate).format('DD MMM YYYY'),
      totalAmount: Number(inv.totalAmount),
      balanceDue: Number(inv.balanceDue),
      status: inv.status,
    })),
  };
}

async function buildOverdueReport(filters: ReportFilters): Promise<ReportResult> {
  const today = dayjs().startOf('day').toDate();
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      dueDate: { lt: today },
      ...(filters.leadId && { leadId: parseInt(filters.leadId) }),
    },
    include: { lead: { select: { companyName: true } } },
    orderBy: { dueDate: 'asc' },
  });

  return {
    title: 'Overdue Report',
    columns: [
      { key: 'invoiceNumber', label: 'Invoice No' },
      { key: 'companyName', label: 'Customer' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'dueDate', label: 'Due Date' },
      { key: 'daysOverdue', label: 'Days Overdue', align: 'right', type: 'number' },
      { key: 'balanceDue', label: 'Balance Due', align: 'right', type: 'currency' },
    ],
    rows: invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      companyName: inv.lead.companyName,
      currencyCode: inv.currencyCode || 'INR',
      dueDate: dayjs(inv.dueDate).format('DD MMM YYYY'),
      daysOverdue: dayjs(today).diff(dayjs(inv.dueDate), 'day'),
      balanceDue: Number(inv.balanceDue),
    })),
  };
}

async function buildAgingReport(filters: ReportFilters): Promise<ReportResult> {
  const today = dayjs().startOf('day');
  const invoices = await prisma.invoice.findMany({
    where: {
      deletedAt: null,
      status: { in: ['PENDING', 'PARTIALLY_PAID'] },
      ...(filters.leadId && { leadId: parseInt(filters.leadId) }),
    },
    include: { lead: { select: { companyName: true } } },
  });

  // Grouped by (customer, currency), not just customer, so a customer
  // with outstanding invoices in more than one currency gets one row per
  // currency instead of their balances being summed into one meaningless
  // blended number.
  const byCustomer: Record<string, { companyName: string; currencyCode: string; current: number; d31_60: number; d61_90: number; d90plus: number }> = {};
  for (const inv of invoices) {
    const companyName = inv.lead.companyName;
    const currencyCode = inv.currencyCode || 'INR';
    const bucketKey = `${companyName} ${currencyCode}`;
    if (!byCustomer[bucketKey]) byCustomer[bucketKey] = { companyName, currencyCode, current: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    const daysOverdue = Math.max(0, today.diff(dayjs(inv.dueDate), 'day'));
    const balance = Number(inv.balanceDue);
    if (daysOverdue <= 30) byCustomer[bucketKey].current += balance;
    else if (daysOverdue <= 60) byCustomer[bucketKey].d31_60 += balance;
    else if (daysOverdue <= 90) byCustomer[bucketKey].d61_90 += balance;
    else byCustomer[bucketKey].d90plus += balance;
  }

  return {
    title: 'Customer Aging Report',
    columns: [
      { key: 'companyName', label: 'Customer' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'current', label: '0-30 Days', align: 'right', type: 'currency' },
      { key: 'd31_60', label: '31-60 Days', align: 'right', type: 'currency' },
      { key: 'd61_90', label: '61-90 Days', align: 'right', type: 'currency' },
      { key: 'd90plus', label: '90+ Days', align: 'right', type: 'currency' },
      { key: 'total', label: 'Total Outstanding', align: 'right', type: 'currency' },
    ],
    rows: Object.values(byCustomer).map((b) => ({
      companyName: b.companyName,
      currencyCode: b.currencyCode,
      current: b.current,
      d31_60: b.d31_60,
      d61_90: b.d61_90,
      d90plus: b.d90plus,
      total: b.current + b.d31_60 + b.d61_90 + b.d90plus,
    })),
  };
}

async function buildPaymentHistoryReport(filters: ReportFilters): Promise<ReportResult> {
  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      ...(filters.from && { paymentDate: { gte: new Date(filters.from) } }),
      ...(filters.to && { paymentDate: { lte: new Date(new Date(filters.to).setHours(23, 59, 59, 999)) } }),
      ...(filters.leadId && { invoice: { leadId: parseInt(filters.leadId) } }),
    },
    include: { invoice: { select: { invoiceNumber: true, currencyCode: true, lead: { select: { companyName: true } } } } },
    orderBy: { paymentDate: 'desc' },
  });

  return {
    title: 'Payment History',
    columns: [
      { key: 'paymentNumber', label: 'Payment No' },
      { key: 'invoiceNumber', label: 'Invoice No' },
      { key: 'companyName', label: 'Customer' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'paymentDate', label: 'Date' },
      { key: 'paymentMethod', label: 'Method' },
      { key: 'referenceNumber', label: 'Reference' },
      { key: 'amount', label: 'Amount', align: 'right', type: 'currency' },
    ],
    rows: payments.map((p) => ({
      paymentNumber: p.paymentNumber,
      invoiceNumber: p.invoice.invoiceNumber,
      companyName: p.invoice.lead.companyName,
      currencyCode: p.invoice.currencyCode || 'INR',
      paymentDate: dayjs(p.paymentDate).format('DD MMM YYYY'),
      paymentMethod: p.paymentMethod,
      referenceNumber: p.referenceNumber || '',
      amount: Number(p.amount),
    })),
  };
}

async function buildCollectionReport(filters: ReportFilters): Promise<ReportResult> {
  const payments = await prisma.payment.findMany({
    where: {
      deletedAt: null,
      ...(filters.from && { paymentDate: { gte: new Date(filters.from) } }),
      ...(filters.to && { paymentDate: { lte: new Date(new Date(filters.to).setHours(23, 59, 59, 999)) } }),
      ...(filters.leadId && { invoice: { leadId: parseInt(filters.leadId) } }),
    },
    include: { invoice: { select: { currencyCode: true, lead: { select: { companyName: true } } } } },
  });

  const groups = groupSumsByCurrency(
    payments,
    (p) => p.invoice.lead.companyName,
    (p) => p.invoice.currencyCode || 'INR',
    (p) => Number(p.amount)
  );

  return {
    title: 'Collection Report',
    columns: [
      { key: 'companyName', label: 'Customer' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'count', label: 'Payments', align: 'right', type: 'number' },
      { key: 'total', label: 'Total Collected', align: 'right', type: 'currency' },
    ],
    rows: groups
      .map((g) => ({ companyName: g.key, currencyCode: g.currencyCode, count: g.count, total: g.total }))
      .sort((a, b) => b.total - a.total),
  };
}

async function buildMonthlyCollectionReport(filters: ReportFilters): Promise<ReportResult> {
  const from = filters.from ? dayjs(filters.from) : dayjs().subtract(11, 'month').startOf('month');
  const payments = await prisma.payment.findMany({
    where: { deletedAt: null, paymentDate: { gte: from.toDate() } },
    include: { invoice: { select: { currencyCode: true } } },
  });

  const numMonths = Math.min(24, dayjs().diff(from, 'month') + 1);
  const monthKeys: string[] = [];
  for (let i = numMonths - 1; i >= 0; i--) monthKeys.push(dayjs().subtract(i, 'month').format('MMM YYYY'));

  // Zero-fill every month so the trend table has no gaps, but only fan
  // out into one row per currency actually present in the data, so an
  // all-INR dataset (today's reality) still renders exactly one row per
  // month, identical to before this change.
  const activeCurrencies = Array.from(new Set(payments.map((p) => p.invoice.currencyCode || 'INR')));
  if (activeCurrencies.length === 0) activeCurrencies.push('INR');

  const bucketKey = (month: string, currencyCode: string) => `${month} ${currencyCode}`;
  const buckets: Record<string, { count: number; total: number }> = {};
  for (const month of monthKeys) {
    for (const currencyCode of activeCurrencies) buckets[bucketKey(month, currencyCode)] = { count: 0, total: 0 };
  }
  for (const p of payments) {
    const month = dayjs(p.paymentDate).format('MMM YYYY');
    const currencyCode = p.invoice.currencyCode || 'INR';
    const k = bucketKey(month, currencyCode);
    if (k in buckets) { buckets[k].count += 1; buckets[k].total += Number(p.amount); }
  }

  return {
    title: 'Monthly Collection Report',
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'count', label: 'Payments', align: 'right', type: 'number' },
      { key: 'total', label: 'Total Collected', align: 'right', type: 'currency' },
    ],
    rows: monthKeys.flatMap((month) =>
      activeCurrencies.map((currencyCode) => {
        const b = buckets[bucketKey(month, currencyCode)];
        return { month, currencyCode, count: b.count, total: b.total };
      })
    ),
  };
}
