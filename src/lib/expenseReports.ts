import prisma from '@/lib/prisma';
import dayjs from 'dayjs';
import { groupSumsByCurrency } from './reportGrouping';
import type { ReportColumn, ReportResult } from './accountingReports';

// Expense reporting for the Reports hub (/dashboard/reports/expenses).
// Deliberately reuses accountingReports.ts's ReportColumn/ReportResult
// contract rather than defining a parallel one — the hub's table renderer,
// the PDF generator (generateReportPDF) and the CSV shape all already speak
// it, so a second contract would mean a second renderer for no gain.
//
// Every grouping below is a dimension the Expense row actually carries.
// Expense.projectId resolves a vertical for free through Project.verticalId
// (NOT NULL), which is why there is no separate Expense.verticalId to fall
// out of sync with it.
//
// Untagged expenses are company overheads — the "Overall Expense" side of
// the Record Expense toggle — and are reported under an explicit "Overall
// (no project)" bucket rather than dropped. A by-project total that silently
// omitted them would not reconcile against the Detail tab, which is a worse
// failure than showing the gap.

// Paid/pending is a property of the underlying expenses, not of a grouped
// row, so it cannot be derived from the table on screen the way the numeric
// totals can — every summary tab collapses PAID and PENDING together. Hence
// it travels with the report.
export interface ExpenseStatusSplit { currencyCode: string; paid: number; pending: number }
export interface ExpenseReportResult extends ReportResult { statusSplit: ExpenseStatusSplit[] }

export type ExpenseReportType =
  | 'detail'
  | 'by-category'
  | 'by-sub-category'
  | 'by-vendor'
  | 'by-payment-method'
  | 'by-project'
  | 'by-vertical'
  | 'monthly';

export interface ExpenseReportFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  subCategoryId?: string;
  status?: string;
  projectId?: string;
  verticalId?: string;
  // "Only expenses booked to some project" — needed so a drill-through from
  // a ledger row that covers ALL projects lands on exactly the rows behind
  // that figure, instead of also pulling in Overall (unassigned) expenses
  // the ledger never counted.
  projectOnly?: boolean;
}

// Every summary report groups by (key, currency) rather than key alone.
// Summing a ₹ expense and a $ expense into one "total" produces a number
// that means nothing — same reasoning as groupSumsByCurrency's own comment,
// and the same rule the accounting reports already follow.
const SUMMARY_COLUMNS = (keyLabel: string): ReportColumn[] => [
  { key: 'key', label: keyLabel },
  { key: 'currencyCode', label: 'Currency' },
  { key: 'count', label: 'Count', align: 'right', type: 'number' },
  { key: 'total', label: 'Total', align: 'right', type: 'currency' },
];

async function loadExpenses(filters: ExpenseReportFilters) {
  const { from, to, categoryId, subCategoryId, status, projectId, verticalId, projectOnly } = filters;
  return prisma.expense.findMany({
    where: {
      deletedAt: null,
      ...(categoryId && { categoryId: parseInt(categoryId) }),
      ...(subCategoryId && { subCategoryId: parseInt(subCategoryId) }),
      ...(status && { status }),
      ...(projectId && { projectId: parseInt(projectId) }),
      ...(projectOnly && !projectId && { projectId: { not: null } }),
      // Filtering by vertical necessarily excludes overall expenses: one
      // with no project has no vertical to match against.
      ...(verticalId && { project: { verticalId: parseInt(verticalId) } }),
      ...((from || to) && {
        expenseDate: {
          ...(from && { gte: new Date(from) }),
          // Inclusive of the whole "to" day — a date-only filter that
          // silently excluded everything recorded that day would quietly
          // under-report, which is worse than being obviously wrong.
          ...(to && { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }),
        },
      }),
    },
    include: {
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      vendorLead: { select: { companyName: true } },
      project: { select: { projectName: true, vertical: { select: { name: true } } } },
    },
    orderBy: { expenseDate: 'desc' },
  });
}

type LoadedExpense = Awaited<ReturnType<typeof loadExpenses>>[number];

// vendorLead is the source of truth once set; `vendor` is the free-text
// fallback kept in sync for historical rows recorded before vendorLeadId
// existed (see the Expense model comment in schema.prisma).
const vendorName = (e: LoadedExpense) => e.vendorLead?.companyName || e.vendor || 'Unspecified';

// A null project is not missing data — it is an Overall Expense — and it is
// labelled as such so a reader does not treat the bucket as a tagging backlog.
const OVERALL_LABEL = 'Overall (no project)';
const projectLabel = (e: LoadedExpense) => e.project?.projectName ?? OVERALL_LABEL;
const verticalLabel = (e: LoadedExpense) => e.project?.vertical.name ?? OVERALL_LABEL;

function summarise(
  expenses: LoadedExpense[],
  title: string,
  keyLabel: string,
  getKey: (e: LoadedExpense) => string,
  sort: 'total-desc' | 'key-asc' = 'total-desc'
): ReportResult {
  const rows = groupSumsByCurrency(expenses, getKey, (e) => e.currencyCode, (e) => Number(e.amount));
  rows.sort((a, b) => (sort === 'key-asc' ? a.key.localeCompare(b.key) : b.total - a.total));
  return { title, columns: SUMMARY_COLUMNS(keyLabel), rows };
}

export async function buildExpenseReport(
  type: ExpenseReportType,
  filters: ExpenseReportFilters
): Promise<ExpenseReportResult> {
  const expenses = await loadExpenses(filters);

  // Computed from the same filtered set every tab is built from, so the
  // split always reconciles with whatever is on screen.
  const splitMap = new Map<string, { paid: number; pending: number }>();
  for (const e of expenses) {
    const ccy = e.currencyCode || 'INR';
    if (!splitMap.has(ccy)) splitMap.set(ccy, { paid: 0, pending: 0 });
    const b = splitMap.get(ccy)!;
    if (e.status === 'PAID') b.paid += Number(e.amount);
    else b.pending += Number(e.amount);
  }
  const statusSplit: ExpenseStatusSplit[] = Array.from(splitMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currencyCode, v]) => ({ currencyCode, ...v }));

  const withSplit = (r: ReportResult): ExpenseReportResult => ({ ...r, statusSplit });

  switch (type) {
    case 'detail':
      return withSplit({
        title: 'Expense Detail',
        columns: [
          { key: 'expenseNumber', label: 'Expense No' },
          { key: 'expenseDate', label: 'Date' },
          { key: 'category', label: 'Category' },
          { key: 'subCategory', label: 'Sub Category' },
          { key: 'vendor', label: 'Vendor' },
          { key: 'project', label: 'Project' },
          { key: 'vertical', label: 'Vertical' },
          { key: 'paymentMethod', label: 'Payment Method' },
          { key: 'status', label: 'Status' },
          { key: 'currencyCode', label: 'Currency' },
          { key: 'amount', label: 'Amount', align: 'right', type: 'currency' },
        ],
        rows: expenses.map((e) => ({
          expenseNumber: e.expenseNumber,
          expenseDate: dayjs(e.expenseDate).format('DD MMM YYYY'),
          category: e.category?.name ?? '—',
          subCategory: e.subCategory?.name ?? '—',
          vendor: vendorName(e),
          project: projectLabel(e),
          vertical: verticalLabel(e),
          paymentMethod: e.paymentMethod,
          status: e.status,
          currencyCode: e.currencyCode,
          amount: Number(e.amount),
        })),
      });

    case 'by-category':
      return withSplit(summarise(expenses, 'Expense by Category', 'Category', (e) => e.category?.name ?? 'Uncategorised'));

    case 'by-sub-category':
      return withSplit(summarise(expenses, 'Expense by Sub Category', 'Sub Category', (e) => e.subCategory?.name ?? 'None'));

    case 'by-vendor':
      return withSplit(summarise(expenses, 'Expense by Vendor', 'Vendor', vendorName));

    case 'by-payment-method':
      return withSplit(summarise(expenses, 'Expense by Payment Method', 'Payment Method', (e) => e.paymentMethod));

    case 'by-project':
      return withSplit(summarise(expenses, 'Expense by Project', 'Project', projectLabel));

    case 'by-vertical':
      return withSplit(summarise(expenses, 'Expense by Vertical', 'Vertical', verticalLabel));

    case 'monthly':
      // Keyed as YYYY-MM rather than "Sep 2026" so the plain key-asc sort is
      // chronological — a display-formatted month would sort alphabetically
      // ("Apr" before "Jan"), which is silently wrong rather than obviously so.
      return withSplit(summarise(expenses, 'Monthly Expense', 'Month', (e) => dayjs(e.expenseDate).format('YYYY-MM'), 'key-asc'));

    default:
      throw new Error(`Unknown expense report type: ${type}`);
  }
}
