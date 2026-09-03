import prisma from '@/lib/prisma';
import dayjs from 'dayjs';
import type { ReportColumn, ReportResult } from './accountingReports';
import { getExchangeRate, RateNotFoundError } from './exchangeRate';

// Customer P&L — Budget vs Actual vs Expense per customer, rolled up from
// its projects. Structurally this is the Project Ledger's "customer" column
// (see projectLedgerReports.ts) turned into the grouping key, the same way
// Vertical Ledger turns Project.verticalId into a grouping key — with one
// addition neither of those reports makes: a Budget/Variance/Utilization/
// Profit view, because that is this report's whole reason to exist rather
// than duplicating what Project Ledger and Vertical Ledger already show.
//
// ACTUAL = Invoice.totalAmount (revenue recognized — billed), not cash
// received. Project Ledger already reports Billed vs Received vs Outstanding
// for the cash-flow question; this report answers a different one ("is this
// customer profitable against plan"), so it deliberately does not repeat
// that split — Payments are not queried here at all.
//
// EXPENSE = Expense.amount booked against the customer's projects (DEBIT in
// Project Ledger's terms). Company overheads carry no project and so sit
// outside this report, same caveat as Vertical Ledger.
//
// BUDGET = Project.budget. Not phased monthly (unlike ExpenseBudget, which
// has ExpenseBudgetMonth rows) — so the Monthly view below reports Actual
// and Expense only, never a monthly Budget/Variance/Utilization, rather than
// fabricating a ÷12 split the data doesn't actually support.
//
// "Customer" = a Lead row, reached via Project.customerId (a converted
// Customer) with Project.leadId as the fallback (a project already running
// against a not-yet-converted Lead) — the same OR resolution /api/projects
// itself uses for its own leadId filter, and the same fallback
// projectLedgerReports.ts's own `customer` column already display uses.

export type CustomerLedgerReportType = 'summary' | 'monthly' | 'by-project';

export interface CustomerLedgerFilters {
  customerId?: string;
  verticalId?: string;
  from?: string;
  to?: string;
  // 'INR' normalizes every foreign-currency transaction into INR using the
  // rate SNAPSHOTTED on that transaction. Any other code (e.g. 'USD') does
  // that first, then applies one additional period rate (from the shared
  // exchange_rates table) from INR to the requested currency — see
  // resolveSecondHopRate. Omitted entirely, amounts stay in their own
  // native currency and rows are split per currency, same as every other
  // ledger report in this app.
  convertTo?: string;
}

const DEFAULT_CURRENCY = 'INR';
const UNDER_BUDGET_THRESHOLD = 90;
const OVER_BUDGET_THRESHOLD = 110;

export type CustomerPnlStatus = 'LOSS' | 'NO_BUDGET' | 'UNDER_BUDGET' | 'OVER_BUDGET' | 'ON_BUDGET';

// "Budget" here is a revenue target, not a spending cap, so "over budget" is
// not automatically bad — it just means the plan itself is due for a
// revision. Loss overrides every other condition: a customer can be sitting
// right on its revenue target and still be losing money delivering it, and
// that has to win.
const STATUS_LABEL: Record<CustomerPnlStatus, string> = {
  LOSS: 'Loss',
  NO_BUDGET: 'No Budget Set',
  UNDER_BUDGET: 'Under Budget',
  OVER_BUDGET: 'Over Budget',
  ON_BUDGET: 'On Budget',
};

function deriveMetrics(budget: number | null, actual: number, expense: number) {
  const profit = actual - expense;
  const utilizationPct = budget !== null && budget > 0 ? (actual / budget) * 100 : null;
  const expensePct = actual > 0 ? (expense / actual) * 100 : null;
  const marginPct = actual > 0 ? (profit / actual) * 100 : null;

  let status: CustomerPnlStatus;
  if (profit < 0) status = 'LOSS';
  else if (utilizationPct === null) status = 'NO_BUDGET';
  else if (utilizationPct < UNDER_BUDGET_THRESHOLD) status = 'UNDER_BUDGET';
  else if (utilizationPct > OVER_BUDGET_THRESHOLD) status = 'OVER_BUDGET';
  else status = 'ON_BUDGET';

  return { profit, utilizationPct, expensePct, marginPct, status: STATUS_LABEL[status] };
}

// Same guard as projectLedgerReports.ts's toBase(): a row already in the
// base currency is a factor of 1 by definition and never consults its
// stored rate, so a stray 0 rate on an INR row can't silently zero it out.
function toInr(amount: number, currency: string, rate: unknown): number | null {
  if (currency === DEFAULT_CURRENCY) return amount;
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  return amount * r;
}

// The period hop from the base ledger currency to whatever else was
// requested. Deliberately a *different* rate source than toInr() above —
// that one is a per-transaction snapshot (never revised), this one is
// today's rate off the shared exchange_rates table — so the two are never
// conflated into a single lookup. Returns null (never a default of 1) when
// no rate is on file; the caller decides how to degrade.
async function resolveSecondHopRate(convertTo: string | undefined): Promise<number | null> {
  if (!convertTo || convertTo === DEFAULT_CURRENCY) return null;
  try {
    return await getExchangeRate(DEFAULT_CURRENCY, convertTo, dayjs().format('YYYY-MM-DD'), 'MANUAL');
  } catch (err) {
    if (err instanceof RateNotFoundError) return null;
    throw err;
  }
}

export async function buildCustomerLedgerReport(
  type: CustomerLedgerReportType,
  filters: CustomerLedgerFilters
): Promise<ReportResult & { warning?: string }> {
  const { customerId, verticalId, from, to, convertTo } = filters;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null;
  const inWindow = (d: Date) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);

  const secondHopRate = await resolveSecondHopRate(convertTo);
  let warning: string | undefined;
  // A requested hop that couldn't be resolved degrades to INR rather than
  // failing the whole report — the customer still gets a normalized,
  // cross-project total, just not in the currency they asked for.
  let effectiveConvertTo = convertTo || null;
  if (effectiveConvertTo && effectiveConvertTo !== DEFAULT_CURRENCY && secondHopRate === null) {
    warning = `No ${DEFAULT_CURRENCY} → ${effectiveConvertTo} exchange rate is on file, so amounts are shown converted to ${DEFAULT_CURRENCY} instead.`;
    effectiveConvertTo = DEFAULT_CURRENCY;
  }
  const convert = (amount: number, currency: string, rate: unknown): number | null => {
    if (!effectiveConvertTo) return amount;
    const inr = toInr(amount, currency, rate);
    if (inr === null) return null;
    return effectiveConvertTo === DEFAULT_CURRENCY ? inr : inr * (secondHopRate as number);
  };
  const bucketCcy = (nativeCcy: string) => effectiveConvertTo || nativeCcy;

  // Project carries no exchangeRate field, so a budget has no per-record
  // snapshot rate the way an invoice or expense does — but an INR-native
  // budget is still convertible with no ambiguity at all, because INR *is*
  // the base ledger currency the second hop starts from. Only a foreign
  // -currency budget that doesn't already match the requested target is
  // genuinely unconvertible, and is shown as unset rather than fabricated.
  const convertBudget = (amount: number, nativeCcy: string): number | null => {
    if (!effectiveConvertTo || nativeCcy === effectiveConvertTo) return amount;
    if (nativeCcy !== DEFAULT_CURRENCY) return null;
    return effectiveConvertTo === DEFAULT_CURRENCY ? amount : amount * (secondHopRate as number);
  };

  const projects = await prisma.project.findMany({
    where: {
      ...(verticalId && { verticalId: parseInt(verticalId) }),
      ...(customerId && { OR: [{ customerId: parseInt(customerId) }, { leadId: parseInt(customerId) }] }),
    },
    include: {
      vertical: { select: { id: true, name: true } },
      customer: { select: { id: true, companyName: true } },
      lead: { select: { id: true, companyName: true } },
    },
    orderBy: { projectName: 'asc' },
  });
  if (projects.length === 0) {
    return { title: 'Customer P&L', columns: [{ key: 'customer', label: 'Customer' }], rows: [], warning };
  }
  const projectIds = projects.map((p) => p.id);
  const custIdOf = (p: (typeof projects)[number]) => p.customerId ?? p.leadId ?? null;
  const custNameOf = (p: (typeof projects)[number]) => p.customer?.companyName ?? p.lead?.companyName ?? '—';

  const [expenses, invoices] = await Promise.all([
    prisma.expense.findMany({
      where: { deletedAt: null, projectId: { in: projectIds } },
      select: { expenseDate: true, amount: true, currencyCode: true, exchangeRate: true, projectId: true },
    }),
    prisma.invoice.findMany({
      where: { deletedAt: null, quotation: { projectId: { in: projectIds } } },
      select: {
        invoiceDate: true, totalAmount: true, currencyCode: true, exchangeRate: true,
        quotation: { select: { projectId: true } },
      },
    }),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // ---- by-project: every project under each customer --------------------
  if (type === 'by-project') {
    const columns: ReportColumn[] = [
      { key: 'customer', label: 'Customer' },
      { key: 'project', label: 'Project' },
      { key: 'vertical', label: 'Vertical' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'budget', label: 'Budget', align: 'right', type: 'currency' },
      { key: 'actual', label: 'Actual', align: 'right', type: 'currency' },
      { key: 'expense', label: 'Expense', align: 'right', type: 'currency' },
      { key: 'variance', label: 'Variance', align: 'right', type: 'currency' },
      { key: 'utilizationPct', label: 'Utilization %', align: 'right', type: 'percent' },
      { key: 'expensePct', label: 'Expense %', align: 'right', type: 'percent' },
      { key: 'profit', label: 'Profit / Loss', align: 'right', type: 'currency' },
      { key: 'marginPct', label: 'Margin %', align: 'right', type: 'percent' },
      { key: 'status', label: 'Status' },
    ];

    const rows: Record<string, any>[] = [];
    for (const p of projects) {
      // Bucketed per currency, same as every other ledger report here — a
      // project billed in two currencies over its life gets two rows, never
      // one row with ₹ and $ silently added together.
      type Cell = { actual: number; expense: number };
      const byCcy = new Map<string, Cell>();
      const bump = (ccy: string, k: keyof Cell, amt: number) => {
        if (!byCcy.has(ccy)) byCcy.set(ccy, { actual: 0, expense: 0 });
        byCcy.get(ccy)![k] += amt;
      };
      for (const i of invoices) {
        if (i.quotation?.projectId !== p.id || !inWindow(i.invoiceDate)) continue;
        const v = convert(Number(i.totalAmount), i.currencyCode || DEFAULT_CURRENCY, i.exchangeRate);
        if (v !== null) bump(bucketCcy(i.currencyCode || DEFAULT_CURRENCY), 'actual', v);
      }
      for (const e of expenses) {
        if (e.projectId !== p.id || !inWindow(e.expenseDate)) continue;
        const v = convert(Number(e.amount), e.currencyCode || DEFAULT_CURRENCY, e.exchangeRate);
        if (v !== null) bump(bucketCcy(e.currencyCode || DEFAULT_CURRENCY), 'expense', v);
      }
      const budgetCcy = bucketCcy(p.budgetCurrencyCode || DEFAULT_CURRENCY);
      if (!byCcy.has(budgetCcy)) byCcy.set(budgetCcy, { actual: 0, expense: 0 });

      for (const [ccy, cell] of Array.from(byCcy.entries()).sort()) {
        // The project's budget belongs on exactly one row — the one in its
        // own (possibly converted) currency — so it is never double-counted
        // across currency rows.
        const budget = ccy === budgetCcy && p.budget !== null
          ? convertBudget(Number(p.budget), p.budgetCurrencyCode || DEFAULT_CURRENCY)
          : null;
        const m = deriveMetrics(budget, cell.actual, cell.expense);
        rows.push({
          _customerId: custIdOf(p), _projectId: p.id, _verticalId: p.verticalId,
          customer: custNameOf(p), project: p.projectName, vertical: p.vertical.name,
          currencyCode: ccy, budget, actual: cell.actual, expense: cell.expense,
          // Undefined without a budget, never "-actual".
          variance: budget === null ? null : cell.actual - budget,
          utilizationPct: m.utilizationPct, expensePct: m.expensePct, profit: m.profit, marginPct: m.marginPct, status: m.status,
        });
      }
    }
    return { title: 'Customer P&L — Projects', columns, rows, warning };
  }

  // ---- monthly ------------------------------------------------------------
  if (type === 'monthly') {
    const columns: ReportColumn[] = [
      { key: 'customer', label: 'Customer' },
      { key: 'period', label: 'Month' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'actual', label: 'Actual', align: 'right', type: 'currency' },
      { key: 'expense', label: 'Expense', align: 'right', type: 'currency' },
      { key: 'profit', label: 'Profit / Loss', align: 'right', type: 'currency' },
    ];

    type Cell = { actual: number; expense: number };
    const buckets = new Map<string, Cell>();
    const key = (cid: number, period: string, ccy: string) => `${cid}||${period}||${ccy}`;
    const bump = (cid: number, d: Date, ccy: string, k: keyof Cell, amt: number) => {
      const kk = key(cid, dayjs(d).format('YYYY-MM'), ccy);
      if (!buckets.has(kk)) buckets.set(kk, { actual: 0, expense: 0 });
      buckets.get(kk)![k] += amt;
    };

    for (const i of invoices) {
      const pid = i.quotation?.projectId;
      const p = pid ? projectById.get(pid) : undefined;
      const cid = p ? custIdOf(p) : null;
      if (!cid || !inWindow(i.invoiceDate)) continue;
      const v = convert(Number(i.totalAmount), i.currencyCode || DEFAULT_CURRENCY, i.exchangeRate);
      if (v !== null) bump(cid, i.invoiceDate, bucketCcy(i.currencyCode || DEFAULT_CURRENCY), 'actual', v);
    }
    for (const e of expenses) {
      // The query filtered projectId to the `in` list above, so it is never
      // null here despite the field's nullable type (Overall expenses carry
      // no projectId and were excluded by that filter already).
      const p = projectById.get(e.projectId!);
      const cid = p ? custIdOf(p) : null;
      if (!cid || !inWindow(e.expenseDate)) continue;
      const v = convert(Number(e.amount), e.currencyCode || DEFAULT_CURRENCY, e.exchangeRate);
      if (v !== null) bump(cid, e.expenseDate, bucketCcy(e.currencyCode || DEFAULT_CURRENCY), 'expense', v);
    }

    const nameOf = new Map<number, string>();
    for (const p of projects) { const cid = custIdOf(p); if (cid) nameOf.set(cid, custNameOf(p)); }

    const rows = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => {
        const [cid, period, ccy] = k.split('||');
        return {
          _customerId: Number(cid),
          customer: nameOf.get(Number(cid)) ?? '—',
          period, currencyCode: ccy,
          actual: c.actual, expense: c.expense, profit: c.actual - c.expense,
        };
      });
    return { title: 'Customer P&L — Monthly', columns, rows, warning };
  }

  // ---- summary --------------------------------------------------------------
  const columns: ReportColumn[] = [
    { key: 'customer', label: 'Customer' },
    { key: 'verticals', label: 'Vertical' },
    { key: 'projectCount', label: 'Projects', align: 'right', type: 'number' },
    { key: 'currencyCode', label: 'Currency' },
    { key: 'budget', label: 'Budget', align: 'right', type: 'currency' },
    { key: 'actual', label: 'Actual', align: 'right', type: 'currency' },
    { key: 'expense', label: 'Expense', align: 'right', type: 'currency' },
    { key: 'variance', label: 'Variance', align: 'right', type: 'currency' },
    { key: 'utilizationPct', label: 'Utilization %', align: 'right', type: 'percent' },
    { key: 'expensePct', label: 'Expense %', align: 'right', type: 'percent' },
    { key: 'profit', label: 'Profit / Loss', align: 'right', type: 'currency' },
    { key: 'marginPct', label: 'Margin %', align: 'right', type: 'percent' },
    { key: 'status', label: 'Status' },
  ];

  type Cell = { budget: number | null; actual: number; expense: number };
  const perCustomer = new Map<number, { projects: (typeof projects); byCcy: Map<string, Cell> }>();
  for (const p of projects) {
    const cid = custIdOf(p);
    if (!cid) continue;
    if (!perCustomer.has(cid)) perCustomer.set(cid, { projects: [], byCcy: new Map() });
    perCustomer.get(cid)!.projects.push(p);
  }
  const bump = (cid: number, ccy: string, patch: Partial<Cell>) => {
    const entry = perCustomer.get(cid);
    if (!entry) return;
    if (!entry.byCcy.has(ccy)) entry.byCcy.set(ccy, { budget: null, actual: 0, expense: 0 });
    const cell = entry.byCcy.get(ccy)!;
    if (patch.actual) cell.actual += patch.actual;
    if (patch.expense) cell.expense += patch.expense;
    if (patch.budget) cell.budget = (cell.budget ?? 0) + patch.budget;
  };

  for (const i of invoices) {
    const pid = i.quotation?.projectId;
    const p = pid ? projectById.get(pid) : undefined;
    const cid = p ? custIdOf(p) : null;
    if (!cid || !inWindow(i.invoiceDate)) continue;
    const v = convert(Number(i.totalAmount), i.currencyCode || DEFAULT_CURRENCY, i.exchangeRate);
    if (v !== null) bump(cid, bucketCcy(i.currencyCode || DEFAULT_CURRENCY), { actual: v });
  }
  for (const e of expenses) {
    const p = projectById.get(e.projectId!);
    const cid = p ? custIdOf(p) : null;
    if (!cid || !inWindow(e.expenseDate)) continue;
    const v = convert(Number(e.amount), e.currencyCode || DEFAULT_CURRENCY, e.exchangeRate);
    if (v !== null) bump(cid, bucketCcy(e.currencyCode || DEFAULT_CURRENCY), { expense: v });
  }
  // Budget is bumped last and only onto the currency row it actually belongs
  // to, same rule as by-project above.
  for (const p of projects) {
    const cid = custIdOf(p);
    if (!cid || p.budget === null) continue;
    const nativeCcy = p.budgetCurrencyCode || DEFAULT_CURRENCY;
    const converted = convertBudget(Number(p.budget), nativeCcy);
    if (converted !== null) bump(cid, bucketCcy(nativeCcy), { budget: converted });
  }

  const rows: Record<string, any>[] = [];
  for (const [cid, entry] of Array.from(perCustomer.entries())) {
    const name = custNameOf(entry.projects[0]);
    const verticals = Array.from(new Set(entry.projects.map((p) => p.vertical.name))).join(', ');
    if (entry.byCcy.size === 0) entry.byCcy.set(bucketCcy(entry.projects[0].budgetCurrencyCode || DEFAULT_CURRENCY), { budget: null, actual: 0, expense: 0 });
    let first = true;
    for (const [ccy, c] of Array.from(entry.byCcy.entries()).sort()) {
      const m = deriveMetrics(c.budget, c.actual, c.expense);
      rows.push({
        _customerId: cid,
        customer: name,
        verticals,
        projectCount: first ? entry.projects.length : null,
        currencyCode: ccy,
        budget: c.budget,
        actual: c.actual,
        expense: c.expense,
        variance: c.budget === null ? null : c.actual - c.budget,
        utilizationPct: m.utilizationPct,
        expensePct: m.expensePct,
        profit: m.profit,
        marginPct: m.marginPct,
        status: m.status,
      });
      first = false;
    }
  }
  // Highest actual revenue first — the customers most worth a manager's
  // attention lead the table instead of an arbitrary alphabetical order.
  rows.sort((a, b) => Number(b.actual) - Number(a.actual));

  return { title: 'Customer P&L', columns, rows, warning };
}
