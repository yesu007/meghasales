import prisma from '@/lib/prisma';
import dayjs from 'dayjs';
import type { ReportColumn, ReportResult } from './accountingReports';

// Project Ledger — what comes IN to a project and what goes OUT of it.
// Built entirely from columns that already exist; no schema change.
//
// DEBIT (out) = Expense.projectId
// CREDIT (in) = Invoice -> Quotation.projectId -> Project
//               Invoice has no projectId of its own, so the quotation is the
//               only link. Payments hang off the invoice and reach a project
//               the same way.
//
// TWO INCOME FIGURES, NOT INTERCHANGEABLE:
//   BILLED   = Invoice.totalAmount — revenue earned, the invoice was raised
//   RECEIVED = Payment.amount      — cash actually banked
//   OUTSTANDING = Billed - Received, i.e. the receivable
// A project showing only Billed looks healthier than the bank account is, so
// both are reported and Balance uses Received only.
//
// Payment.amount is denominated in the INVOICE's currency; Payment.paidAmount
// is what the payer handed over in theirs. Only `amount` can be compared
// against the invoice, so only `amount` is used here.
//
// Amounts are grouped per currency and never converted: an INR expense and a
// THB invoice on one project are two rows, because netting them would mean
// choosing an exchange rate, which is a finance decision, not a report's.

export type ProjectLedgerReportType = 'summary' | 'monthly' | 'transactions';

export interface ProjectLedgerFilters {
  projectId?: string;
  verticalId?: string;
  from?: string;
  to?: string;
  // When set (currently only 'INR'), every amount is converted into this
  // currency using the rate SNAPSHOTTED ON THE RECORD, never a live rate, so
  // a historical row never changes value because today's rate moved.
  convertTo?: string;
}

const DEFAULT_CURRENCY = 'INR';

// Converting an amount into the base currency.
//
// The guard matters: an INR row whose stored exchange_rate is 0 (main's
// expense PUT turns an empty rate field into Number('') === 0) would
// otherwise contribute zero and silently under-report. A row already in the
// base currency is always a factor of 1 by definition, so the stored rate is
// not consulted at all — which makes the conversion immune to that bug.
// A non-base row with a missing or non-positive rate is genuinely
// unconvertible and is reported as such rather than guessed at.
function toBase(amount: number, currency: string, rate: unknown, base: string): number | null {
  if (currency === base) return amount;
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  return amount * r;
}

export async function buildProjectLedgerReport(
  type: ProjectLedgerReportType,
  filters: ProjectLedgerFilters
): Promise<ReportResult> {
  const { projectId, verticalId, from, to, convertTo } = filters;
  const base = convertTo || null;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null;
  const inWindow = (d: Date) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);

  const projects = await prisma.project.findMany({
    where: {
      ...(projectId && { id: parseInt(projectId) }),
      ...(verticalId && { verticalId: parseInt(verticalId) }),
    },
    include: {
      vertical: { select: { id: true, name: true } },
      customer: { select: { companyName: true } },
      lead: { select: { companyName: true } },
    },
    orderBy: { projectName: 'asc' },
  });
  if (projects.length === 0) {
    return { title: 'Project Ledger', columns: [{ key: 'project', label: 'Project' }], rows: [] };
  }
  const projectIds = projects.map((p) => p.id);

  const [expenses, invoices] = await Promise.all([
    prisma.expense.findMany({
      where: { deletedAt: null, projectId: { in: projectIds } },
      select: {
        expenseNumber: true, expenseDate: true, amount: true, currencyCode: true, exchangeRate: true, projectId: true,
        category: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null, quotation: { projectId: { in: projectIds } } },
      select: {
        invoiceNumber: true, invoiceDate: true, totalAmount: true, currencyCode: true, exchangeRate: true,
        quotation: { select: { projectId: true } },
        payments: { where: { deletedAt: null }, select: { paymentNumber: true, paymentDate: true, amount: true } },
      },
    }),
  ]);

  // The income popup reuses the transactions build and filters to the
  // Invoice/Payment rows client-side, rather than a second query that could
  // drift out of step with what the ledger totalled.
  if (type === 'transactions') {
    const columns: ReportColumn[] = [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'reference', label: 'Reference' },
      { key: 'description', label: 'Description' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'billed', label: 'Billed', align: 'right', type: 'currency' },
      { key: 'credit', label: 'Credit (In)', align: 'right', type: 'currency' },
      { key: 'debit', label: 'Debit (Out)', align: 'right', type: 'currency' },
      { key: 'balance', label: 'Balance', align: 'right', type: 'currency' },
    ];

    type Txn = { d: Date; projectId: number | null; type: string; reference: string; description: string; ccy: string; billed: number; credit: number; debit: number };
    const txns: Txn[] = [];

    // An invoice is not cash. It records what was billed and leaves the
    // running balance alone — otherwise raising an invoice and then being
    // paid for it would count the same money twice.
    for (const i of invoices) {
      const ccy = i.currencyCode || DEFAULT_CURRENCY;
      if (inWindow(i.invoiceDate)) {
        txns.push({ d: i.invoiceDate, projectId: i.quotation?.projectId ?? null, type: 'Invoice', reference: i.invoiceNumber, description: 'Billed to customer', ccy, billed: Number(i.totalAmount), credit: 0, debit: 0 });
      }
      for (const p of i.payments) {
        if (!inWindow(p.paymentDate)) continue;
        txns.push({ d: p.paymentDate, projectId: i.quotation?.projectId ?? null, type: 'Payment', reference: p.paymentNumber, description: `Received against ${i.invoiceNumber}`, ccy, billed: 0, credit: Number(p.amount), debit: 0 });
      }
    }
    for (const e of expenses) {
      if (!inWindow(e.expenseDate)) continue;
      txns.push({ d: e.expenseDate, projectId: e.projectId ?? null, type: 'Expense', reference: e.expenseNumber, description: e.category?.name ?? '—', ccy: e.currencyCode || DEFAULT_CURRENCY, billed: 0, credit: 0, debit: Number(e.amount) });
    }
    txns.sort((a, b) => a.d.getTime() - b.d.getTime());

    // Running balance is per currency — one running total across mixed
    // currencies would be arithmetic on incompatible units.
    const running = new Map<string, number>();
    const rows = txns.map((t) => {
      const bal = (running.get(t.ccy) || 0) + t.credit - t.debit;
      running.set(t.ccy, bal);
      return {
        // Carried for the drill-through link, not rendered as a column.
        _projectId: t.projectId,
        _day: dayjs(t.d).format('YYYY-MM-DD'),
        date: dayjs(t.d).format('DD MMM YYYY'),
        type: t.type,
        reference: t.reference,
        description: t.description,
        currencyCode: t.ccy,
        billed: t.billed,
        credit: t.credit,
        debit: t.debit,
        balance: bal,
      };
    });

    const only = projects.length === 1 ? ` — ${projects[0].projectName}` : '';
    return { title: `Project Ledger — Transactions${only}`, columns, rows };
  }

  if (type === 'monthly') {
    const columns: ReportColumn[] = [
      { key: 'period', label: 'Month' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'billed', label: 'Billed', align: 'right', type: 'currency' },
      { key: 'credit', label: 'Credit (In)', align: 'right', type: 'currency' },
      { key: 'debit', label: 'Debit (Out)', align: 'right', type: 'currency' },
      { key: 'net', label: 'Net', align: 'right', type: 'currency' },
    ];

    type Cell = { billed: number; credit: number; debit: number };
    const buckets = new Map<string, Cell>();
    const cell = (period: string, ccy: string) => {
      const k = `${period}||${ccy}`;
      if (!buckets.has(k)) buckets.set(k, { billed: 0, credit: 0, debit: 0 });
      return buckets.get(k)!;
    };
    const period = (d: Date) => dayjs(d).format('YYYY-MM');

    for (const i of invoices) {
      const ccy = i.currencyCode || DEFAULT_CURRENCY;
      if (inWindow(i.invoiceDate)) cell(period(i.invoiceDate), ccy).billed += Number(i.totalAmount);
      // Cash lands in the month it was received, not the month billed — a
      // July invoice paid in September is September's cash.
      for (const p of i.payments) if (inWindow(p.paymentDate)) cell(period(p.paymentDate), ccy).credit += Number(p.amount);
    }
    for (const e of expenses) if (inWindow(e.expenseDate)) cell(period(e.expenseDate), e.currencyCode || DEFAULT_CURRENCY).debit += Number(e.amount);

    const rows = Array.from(buckets.entries())
      // Sorted on the YYYY-MM key so months read chronologically; a
      // display-formatted month would sort alphabetically.
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const [per, ccy] = k.split('||');
        return { period: per, currencyCode: ccy, billed: v.billed, credit: v.credit, debit: v.debit, net: v.credit - v.debit };
      });

    const only = projects.length === 1 ? ` — ${projects[0].projectName}` : '';
    return { title: `Project Ledger — Monthly${only}`, columns, rows };
  }

  const columns: ReportColumn[] = [
    { key: 'project', label: 'Project' },
    { key: 'vertical', label: 'Vertical' },
    { key: 'customer', label: 'Customer' },
    { key: 'currencyCode', label: 'Currency' },
    { key: 'budget', label: 'Budget', align: 'right', type: 'currency' },
    { key: 'billed', label: 'Billed', align: 'right', type: 'currency' },
    { key: 'credit', label: 'Credit (In)', align: 'right', type: 'currency' },
    { key: 'outstanding', label: 'Outstanding', align: 'right', type: 'currency' },
    { key: 'debit', label: 'Debit (Out)', align: 'right', type: 'currency' },
    { key: 'balance', label: 'Balance', align: 'right', type: 'currency' },
    { key: 'status', label: 'Status' },
  ];

  const rows: Record<string, any>[] = [];
  for (const p of projects) {
    const byCcy = new Map<string, { billed: number; credit: number; debit: number }>();
    const bump = (ccy: string, key: 'billed' | 'credit' | 'debit', amt: number) => {
      if (!byCcy.has(ccy)) byCcy.set(ccy, { billed: 0, credit: 0, debit: 0 });
      byCcy.get(ccy)![key] += amt;
    };

    for (const i of invoices) {
      if (i.quotation?.projectId !== p.id) continue;
      const ccy = i.currencyCode || DEFAULT_CURRENCY;
      // Payment.amount is already denominated in the INVOICE's currency, so
      // it converts with the invoice's rate, never the payment's own.
      const conv = (amt: number) => (base ? toBase(amt, ccy, i.exchangeRate, base) : amt);
      const target = base || ccy;
      if (inWindow(i.invoiceDate)) { const v = conv(Number(i.totalAmount)); if (v !== null) bump(target, 'billed', v); }
      for (const pmt of i.payments) {
        if (!inWindow(pmt.paymentDate)) continue;
        const v = conv(Number(pmt.amount));
        if (v !== null) bump(target, 'credit', v);
      }
    }
    for (const e of expenses) {
      if (e.projectId !== p.id || !inWindow(e.expenseDate)) continue;
      const ccy = e.currencyCode || DEFAULT_CURRENCY;
      const v = base ? toBase(Number(e.amount), ccy, e.exchangeRate, base) : Number(e.amount);
      if (v !== null) bump(base || ccy, 'debit', v);
    }

    const budgetCcy = base || p.budgetCurrencyCode || DEFAULT_CURRENCY;
    if (!byCcy.has(budgetCcy)) byCcy.set(budgetCcy, { billed: 0, credit: 0, debit: 0 });

    for (const [ccy, v] of Array.from(byCcy.entries()).sort()) {
      // The project's budget belongs on exactly one row — the one in its own
      // currency — so it is never double-counted across currency rows.
      const isBudgetRow = ccy === budgetCcy;
      rows.push({
        _projectId: p.id,
        project: p.projectName,
        vertical: p.vertical.name,
        customer: p.customer?.companyName || p.lead?.companyName || '—',
        currencyCode: ccy,
        // A project budget in a foreign currency has no rate of its own to
        // convert with, so it is shown only when it already matches the
        // target currency — a converted-looking figure with no rate behind
        // it would be a fabrication.
        budget: isBudgetRow && p.budget !== null && (!base || (p.budgetCurrencyCode || DEFAULT_CURRENCY) === base)
          ? Number(p.budget)
          : null,
        billed: v.billed,
        credit: v.credit,
        outstanding: v.billed - v.credit,
        debit: v.debit,
        // Cash position: received less spent. Billed-but-unpaid is
        // deliberately excluded — a receivable is not money yet.
        balance: v.credit - v.debit,
        status: p.isActive ? 'Active' : 'Inactive',
      });
    }
  }

  return { title: base ? `Project Ledger (converted to ${base})` : 'Project Ledger', columns, rows };
}
