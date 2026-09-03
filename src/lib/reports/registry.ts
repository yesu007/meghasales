// Single declarative source of truth for the Reports hub
// (src/app/dashboard/reports/page.tsx). Adding a report to the hub is one
// entry here — no page edit — the same "declarative table, filtered by
// permission" shape the dashboard nav itself uses (see getNavItems() in
// src/app/dashboard/layout.tsx).
//
// Scope note: this hub lists only reports built *under* /dashboard/reports.
// The module-owned report pages that already exist (Accounting → Reports,
// Payroll → Reports, Meetings → Reports, Audit Report) are deliberately NOT
// duplicated here — they stay reachable from their own modules exactly as
// before. Linking them in later is a one-line addition per report if that is
// ever wanted; it is not a prerequisite for anything here.

export type ReportGroup = 'Finance' | 'Sales' | 'People';

// 'available' renders as a live link. 'planned' renders greyed out and
// unclickable — it documents what the hub is growing into so the page reads
// as a roadmap rather than an empty shell, without pretending the report
// exists. Flip to 'available' in the same commit that ships the page.
export type ReportStatus = 'available' | 'planned';

export interface ReportDefinition {
  key: string;
  name: string;
  // One plain-language line: what question this report answers. Report names
  // alone ("Aging", "Variance") mean nothing to someone who has not used
  // them before, which is exactly who a hub page is for.
  description: string;
  href: string;
  group: ReportGroup;
  // Same convention as NavItem.permission — omitted means "any logged-in
  // user who can reach the hub at all". Checked client-side for display
  // only; each report's own route still enforces its own requirePermission().
  permission?: string;
  status: ReportStatus;
}

export const REPORT_GROUPS: ReportGroup[] = ['Finance', 'Sales', 'People'];

export const REPORTS: ReportDefinition[] = [
  {
    key: 'expense-summary',
    name: 'Expense Report',
    description: 'Spend by category, sub-category, vendor, project, vertical and month, with paid/pending totals.',
    href: '/dashboard/reports/expenses',
    group: 'Finance',
    permission: 'view_expenses',
    status: 'available',
  },
  {
    key: 'customer-pnl',
    name: 'Customer P&L',
    description: 'Budget, billed revenue, expense and profit per customer, rolled up from its projects — with variance and budget-utilization status.',
    href: '/dashboard/reports/customer-pnl',
    group: 'Finance',
    permission: 'view_projects',
    status: 'available',
  },
  {
    key: 'vertical-ledger',
    name: 'Vertical Ledger',
    description: 'Credit and debit per business vertical, rolled up from its projects.',
    href: '/dashboard/reports/vertical-ledger',
    group: 'Finance',
    permission: 'view_projects',
    status: 'available',
  },
  {
    key: 'project-ledger',
    name: 'Project Ledger',
    description: 'Credit and debit per project — invoices billed, payments received, and spend booked against it.',
    href: '/dashboard/reports/project-ledger',
    group: 'Finance',
    permission: 'view_projects',
    status: 'available',
  },
];
