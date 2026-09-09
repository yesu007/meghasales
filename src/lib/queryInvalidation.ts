import type { QueryClient } from '@tanstack/react-query';

// Central registry of cross-module React Query cache dependencies.
//
// Problem: several modules read the *same* underlying data under
// *different* query keys (most importantly: "Customer" is a Lead row with
// status=CONFIRMED — see src/app/api/customers/route.ts's own module
// note — so src/app/dashboard/leads/page.tsx's ['leads', ...] and
// src/app/dashboard/customers/page.tsx's ['customers', ...] are two
// independently-cached views over one table), plus a long tail of
// "leads-for-X" / "customers-for-X" dropdown queries used by Quotations,
// Demos, Implementations, Invoices, Projects, Expenses and Meetings
// reports. A mutation that only invalidates its own page's query key
// leaves every sibling view holding stale data — with this app's shared
// QueryClient (src/app/providers.tsx, staleTime: 30000) that stale data
// keeps being served for up to 30s even after navigating to the other
// module, so the change doesn't "appear" until a manual browser refresh.
//
// Fix: rather than scatter ad hoc lists of queryKeys across every mutation
// site (fragile, easy to miss one), each affected module's mutations call
// one of the small `invalidate*` functions below. This is the exact same
// `queryClient.invalidateQueries` mechanism already used everywhere in
// this codebase (see e.g. src/app/dashboard/quotations/page.tsx's own
// "approve" mutation invalidating both ['quotations'] and
// ['accounting-invoices']) — just with the dependency knowledge collected
// in one place instead of duplicated. invalidateQueries is push-based
// (React Query re-runs any currently-mounted query for that key
// immediately; a not-currently-mounted query is simply marked stale and
// refetches next time it mounts) — no polling, no full-page reload.
//
// Extend the relevant array below whenever a new module starts reading
// Lead/Customer/Quotation/Project/Demo/Implementation/Invoice data under
// its own query key.

const LEAD_CUSTOMER_KEYS = [
  'leads', 'lead', 'lead-stats', 'lead-activities',
  'customers', 'customer', 'customer-contracts', 'customer-kyc', 'customer-implementations',
  'dashboard-stats',
  'leads-for-invoice', 'leads-for-quotation', 'leads-for-demo', 'leads-for-impl',
  'leads-for-project', 'leads-for-product', 'leads-for-ledger', 'leads-for-report',
  'customers-for-project', 'customers-for-product', 'customers-for-expense-vendor',
  'all-projects', 'projects-for-lead',
  'meeting-report-leads',
];

const QUOTATION_KEYS = [
  'quotations', 'leads-for-quotation', 'dashboard-stats',
  // Project/Product Master's own Budget Estimation panels
  // (ProjectBudgetPanel/ProductBudgetPanel) show a linked quotation's
  // status/amount straight from the Quotation record itself — no separate
  // copy is kept on Project/Product — so any quotation create/update
  // (including a plain status change, e.g. Draft -> Approved) or delete
  // must refresh both, wherever currently mounted, or an already-open
  // panel would keep showing the pre-change status until its own 30s
  // staleTime lapses. Both keys are parametrized with an id
  // (['project-budget-quotations', projectId]) — passing just the bare key
  // here matches every id at once, same partial-match convention as every
  // other key in this file.
  'project-budget-quotations', 'product-budget-quotations',
];

const PROJECT_KEYS = [
  'projects-admin', 'all-projects', 'projects-for-lead', 'lead-projects',
  'leads-for-project', 'customers-for-project', 'customer-projects',
];

// Call after a Product create/update/delete. A separate master from
// Project (own table/relations — see the Product model's own schema
// comment), so this is its own key list rather than folded into
// PROJECT_KEYS, even though the shape is identical.
const PRODUCT_KEYS = [
  'products-admin', 'leads-for-product', 'customers-for-product', 'customer-products',
  // The Expenses module's own Product dropdown/sidebar (Product Expense
  // tab) — without this, a newly created/activated Product (or one
  // deactivated) kept showing the pre-change list there until the shared
  // QueryClient's 30s staleTime lapsed or the page was manually refreshed.
  'products-for-expense',
  // The Quotation Resource Calculator's own Product dropdown (mirrors
  // 'projects-for-lead' in PROJECT_KEYS above).
  'products-for-lead',
  // The Implementations module's own Filters panel Product dropdown.
  'products-for-impl-filter',
];

const DEMO_KEYS = ['demos', 'leads-for-demo', 'dashboard-stats'];

const IMPLEMENTATION_KEYS = [
  'implementations', 'customers', 'leads-for-impl', 'meeting-report-implementations', 'dashboard-stats',
  // The Customer main table's per-Project Status/Stage accordion
  // (src/components/customers/CustomerProjectsPanel.tsx) reads a Project's
  // Implementation the same way the Implementations module itself does.
  // Same for its per-Product sibling (CustomerProductsPanel).
  'customer-projects', 'customer-products',
];

const INVOICE_KEYS = [
  'accounting-invoices', 'accounting-dashboard-stats', 'leads-for-invoice', 'dashboard-stats',
];

// Call after an Expense create/update/delete/status-change. Project/Product
// Master's own Budget Estimation panels (ProjectBudgetPanel/
// ProductBudgetPanel) sum expenses into their "Actual/Spent" figure — no
// separate copy of that total is kept, it's read live off the Expense
// rows themselves — so any expense mutation must refresh both, wherever
// currently mounted, same "already-open panel keeps showing pre-change
// data until its own 30s staleTime lapses" rationale as
// project-budget-quotations/product-budget-quotations above.
const EXPENSE_KEYS = [
  'expenses', 'project-budget-expenses', 'product-budget-expenses',
];

function invalidateAll(queryClient: QueryClient, keys: string[]) {
  keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
}

// Lead ⇄ Customer are the same table (see module comment above) — call
// this after any Lead or Customer create/update/delete/status-change
// (including conversion, i.e. status → CONFIRMED) so every module that
// reads Lead or Customer data, directly or as a dropdown/lookup, refreshes.
export function invalidateLeadCustomerData(queryClient: QueryClient) {
  invalidateAll(queryClient, LEAD_CUSTOMER_KEYS);
}

// Call after a Quotation create/update/delete/approve. Quotation creation
// without an existing Lead selected auto-creates one (see
// src/app/api/leads/route.ts's own leadSource: 'QUOTATION' comment), so
// this also covers that Lead/dashboard-stats side effect.
export function invalidateQuotationData(queryClient: QueryClient) {
  invalidateAll(queryClient, QUOTATION_KEYS);
  invalidateAll(queryClient, LEAD_CUSTOMER_KEYS);
}

// Call after a Project create/update/delete.
export function invalidateProjectData(queryClient: QueryClient) {
  invalidateAll(queryClient, PROJECT_KEYS);
}

// Call after a Product create/update/delete.
export function invalidateProductData(queryClient: QueryClient) {
  invalidateAll(queryClient, PRODUCT_KEYS);
}

// Call after a Demo create/update/delete.
export function invalidateDemoData(queryClient: QueryClient) {
  invalidateAll(queryClient, DEMO_KEYS);
}

// Call after an Implementation create/update/delete — including the
// inline Stage/Status edits on the Customer main table (see
// src/app/dashboard/customers/page.tsx's own ensureImplementationThenUpdate).
export function invalidateImplementationData(queryClient: QueryClient) {
  invalidateAll(queryClient, IMPLEMENTATION_KEYS);
}

// Call after an Invoice/Payment create/update/delete.
export function invalidateInvoiceData(queryClient: QueryClient) {
  invalidateAll(queryClient, INVOICE_KEYS);
}

// Call after an Expense create/update/delete/mark-paid.
export function invalidateExpenseData(queryClient: QueryClient) {
  invalidateAll(queryClient, EXPENSE_KEYS);
}
