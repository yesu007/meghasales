import prisma from '@/lib/prisma';
import dayjs from 'dayjs';
import type { ReportColumn, ReportResult } from './accountingReports';

// Vertical Ledger — money in and out per business vertical.
//
// A vertical is a group of projects, so this is the Project Ledger rolled up
// through Project.verticalId (NOT NULL, so the rollup is exact and total):
//   CREDIT (in)  = payments received against its projects' invoices
//   BILLED       = invoices raised against its projects
//   DEBIT (out)  = expenses booked to its projects
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO:
//
// 1. Vertical-to-vertical transfers. When one vertical supplies a resource
//    to another, the cost is recorded as an ordinary Expense on the
//    consuming vertical's project — so the DEBIT side is complete and
//    correct. The supplying vertical shows no matching credit, because no
//    table in this schema can reference two verticals (there is no
//    from/to_vertical_id column anywhere). Adding a credit here without such
//    a record would mean inventing it.
//
// 2. Company overheads. Rent, salaries and office admin carry no project
//    (the "Overall Expense" side of the Record Expense toggle), so they have
//    no vertical either and sit outside every row. A vertical's Debit is
//    therefore its DIRECT project cost, not its fully-loaded cost — stated
//    on the page, not just here.

export type VerticalLedgerReportType = 'summary' | 'monthly' | 'by-project';

export interface VerticalLedgerFilters {
  verticalId?: string;
  from?: string;
  to?: string;
  includeInactive?: boolean;
}

const DEFAULT_CURRENCY = 'INR';

export async function buildVerticalLedgerReport(
  type: VerticalLedgerReportType,
  filters: VerticalLedgerFilters
): Promise<ReportResult> {
  const { verticalId, from, to, includeInactive } = filters;
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null;
  const inWindow = (d: Date) => (!fromDate || d >= fromDate) && (!toDate || d <= toDate);

  const verticals = await prisma.vertical.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(verticalId && { id: parseInt(verticalId) }),
    },
    include: {
      head: { select: { firstName: true, lastName: true } },
      projects: { select: { id: true, projectName: true, isActive: true, budget: true, budgetCurrencyCode: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  if (verticals.length === 0) {
    return { title: 'Vertical Ledger', columns: [{ key: 'vertical', label: 'Vertical' }], rows: [] };
  }

  const projectIds = verticals.flatMap((v) => v.projects.map((p) => p.id));
  const verticalOfProject = new Map<number, number>();
  for (const v of verticals) for (const p of v.projects) verticalOfProject.set(p.id, v.id);

  const [expenses, invoices] = projectIds.length
    ? await Promise.all([
        prisma.expense.findMany({
          where: { deletedAt: null, projectId: { in: projectIds } },
          select: { expenseDate: true, amount: true, currencyCode: true, projectId: true },
        }),
        prisma.invoice.findMany({
          where: { deletedAt: null, quotation: { projectId: { in: projectIds } } },
          select: {
            invoiceDate: true, totalAmount: true, currencyCode: true,
            quotation: { select: { projectId: true } },
            payments: { where: { deletedAt: null }, select: { paymentDate: true, amount: true } },
          },
        }),
      ])
    : [[], []];

  const headName = (v: (typeof verticals)[number]) =>
    v.head ? `${v.head.firstName} ${v.head.lastName}` : 'Unassigned';

  type Cell = { billed: number; credit: number; debit: number };
  const blank = (): Cell => ({ billed: 0, credit: 0, debit: 0 });

  // ---- by-project: every project under each vertical -----------------------
  if (type === 'by-project') {
    const perProject = new Map<number, Map<string, Cell>>();
    const bumpP = (pid: number, ccy: string, k: keyof Cell, amt: number) => {
      if (!perProject.has(pid)) perProject.set(pid, new Map());
      const m = perProject.get(pid)!;
      if (!m.has(ccy)) m.set(ccy, blank());
      m.get(ccy)![k] += amt;
    };
    for (const i of invoices) {
      const pid = i.quotation?.projectId;
      if (!pid) continue;
      const ccy = i.currencyCode || DEFAULT_CURRENCY;
      if (inWindow(i.invoiceDate)) bumpP(pid, ccy, 'billed', Number(i.totalAmount));
      for (const p of i.payments) if (inWindow(p.paymentDate)) bumpP(pid, ccy, 'credit', Number(p.amount));
    }
    for (const e of expenses) {
      if (!e.projectId || !inWindow(e.expenseDate)) continue;
      bumpP(e.projectId, e.currencyCode || DEFAULT_CURRENCY, 'debit', Number(e.amount));
    }

    const columns: ReportColumn[] = [
      { key: 'vertical', label: 'Vertical' },
      { key: 'project', label: 'Project' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'billed', label: 'Billed', align: 'right', type: 'currency' },
      { key: 'credit', label: 'Credit (In)', align: 'right', type: 'currency' },
      { key: 'debit', label: 'Debit (Out)', align: 'right', type: 'currency' },
      { key: 'balance', label: 'Balance', align: 'right', type: 'currency' },
      { key: 'status', label: 'Status' },
    ];

    const rows: Record<string, any>[] = [];
    for (const v of verticals) {
      for (const p of v.projects) {
        const m = perProject.get(p.id) ?? new Map<string, Cell>();
        if (m.size === 0) m.set(p.budgetCurrencyCode || DEFAULT_CURRENCY, blank());
        for (const [ccy, c] of Array.from(m.entries()).sort()) {
          rows.push({
            _verticalId: v.id, _projectId: p.id,
            vertical: v.name, project: p.projectName, currencyCode: ccy,
            billed: c.billed, credit: c.credit, debit: c.debit,
            balance: c.credit - c.debit,
            status: p.isActive ? 'Active' : 'Inactive',
          });
        }
      }
    }
    return { title: 'Vertical Ledger — Projects', columns, rows };
  }

  // ---- monthly -------------------------------------------------------------
  if (type === 'monthly') {
    const buckets = new Map<string, Cell>();
    const key = (vId: number, period: string, ccy: string) => `${vId}||${period}||${ccy}`;
    const bumpM = (vId: number, d: Date, ccy: string, k: keyof Cell, amt: number) => {
      const kk = key(vId, dayjs(d).format('YYYY-MM'), ccy);
      if (!buckets.has(kk)) buckets.set(kk, blank());
      buckets.get(kk)![k] += amt;
    };
    for (const i of invoices) {
      const pid = i.quotation?.projectId;
      const vId = pid ? verticalOfProject.get(pid) : undefined;
      if (!vId) continue;
      const ccy = i.currencyCode || DEFAULT_CURRENCY;
      if (inWindow(i.invoiceDate)) bumpM(vId, i.invoiceDate, ccy, 'billed', Number(i.totalAmount));
      // Cash lands in the month received, not the month billed.
      for (const p of i.payments) if (inWindow(p.paymentDate)) bumpM(vId, p.paymentDate, ccy, 'credit', Number(p.amount));
    }
    for (const e of expenses) {
      const vId = e.projectId ? verticalOfProject.get(e.projectId) : undefined;
      if (!vId || !inWindow(e.expenseDate)) continue;
      bumpM(vId, e.expenseDate, e.currencyCode || DEFAULT_CURRENCY, 'debit', Number(e.amount));
    }

    const nameOf = new Map(verticals.map((v) => [v.id, v.name]));
    const columns: ReportColumn[] = [
      { key: 'vertical', label: 'Vertical' },
      { key: 'period', label: 'Month' },
      { key: 'currencyCode', label: 'Currency' },
      { key: 'billed', label: 'Billed', align: 'right', type: 'currency' },
      { key: 'credit', label: 'Credit (In)', align: 'right', type: 'currency' },
      { key: 'debit', label: 'Debit (Out)', align: 'right', type: 'currency' },
      { key: 'balance', label: 'Balance', align: 'right', type: 'currency' },
    ];
    const rows = Array.from(buckets.entries())
      // Sorted on the raw YYYY-MM key so months read chronologically.
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => {
        const [vId, period, ccy] = k.split('||');
        return {
          _verticalId: Number(vId),
          vertical: nameOf.get(Number(vId)) ?? '—',
          period, currencyCode: ccy,
          billed: c.billed, credit: c.credit, debit: c.debit,
          balance: c.credit - c.debit,
        };
      });
    return { title: 'Vertical Ledger — Monthly', columns, rows };
  }

  // ---- summary -------------------------------------------------------------
  const perVertical = new Map<number, Map<string, Cell>>();
  const bumpV = (vId: number, ccy: string, k: keyof Cell, amt: number) => {
    if (!perVertical.has(vId)) perVertical.set(vId, new Map());
    const m = perVertical.get(vId)!;
    if (!m.has(ccy)) m.set(ccy, blank());
    m.get(ccy)![k] += amt;
  };
  for (const i of invoices) {
    const pid = i.quotation?.projectId;
    const vId = pid ? verticalOfProject.get(pid) : undefined;
    if (!vId) continue;
    const ccy = i.currencyCode || DEFAULT_CURRENCY;
    if (inWindow(i.invoiceDate)) bumpV(vId, ccy, 'billed', Number(i.totalAmount));
    for (const p of i.payments) if (inWindow(p.paymentDate)) bumpV(vId, ccy, 'credit', Number(p.amount));
  }
  for (const e of expenses) {
    const vId = e.projectId ? verticalOfProject.get(e.projectId) : undefined;
    if (!vId || !inWindow(e.expenseDate)) continue;
    bumpV(vId, e.currencyCode || DEFAULT_CURRENCY, 'debit', Number(e.amount));
  }

  const columns: ReportColumn[] = [
    { key: 'vertical', label: 'Vertical' },
    { key: 'head', label: 'Head' },
    { key: 'projectCount', label: 'Projects', align: 'right', type: 'number' },
    { key: 'currencyCode', label: 'Currency' },
    { key: 'billed', label: 'Billed', align: 'right', type: 'currency' },
    { key: 'credit', label: 'Credit (In)', align: 'right', type: 'currency' },
    { key: 'outstanding', label: 'Outstanding', align: 'right', type: 'currency' },
    { key: 'debit', label: 'Debit (Out)', align: 'right', type: 'currency' },
    { key: 'balance', label: 'Balance', align: 'right', type: 'currency' },
    { key: 'status', label: 'Status' },
  ];

  const rows: Record<string, any>[] = [];
  for (const v of verticals) {
    const m = perVertical.get(v.id) ?? new Map<string, Cell>();
    if (m.size === 0) m.set(v.budgetCurrencyCode || DEFAULT_CURRENCY, blank());
    let first = true;
    for (const [ccy, c] of Array.from(m.entries()).sort()) {
      rows.push({
        _verticalId: v.id,
        vertical: v.name,
        head: headName(v),
        // Counted once per vertical, not repeated on each currency row — a
        // vertical with two currencies does not have twice the projects.
        projectCount: first ? v.projects.length : null,
        currencyCode: ccy,
        billed: c.billed,
        credit: c.credit,
        outstanding: c.billed - c.credit,
        debit: c.debit,
        // Cash position: received less spent. Billed-but-unpaid is excluded —
        // a receivable is not money.
        balance: c.credit - c.debit,
        status: v.isActive ? 'Active' : 'Inactive',
      });
      first = false;
    }
  }

  return { title: 'Vertical Ledger', columns, rows };
}
