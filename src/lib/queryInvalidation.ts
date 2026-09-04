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
  'leads-for-project', 'leads-for-ledger', 'leads-for-report',
  'customers-for-project', 'customers-for-expense-vendor',
  'all-projects', 'projects-for-lead',
  'meeting-report-leads',
];

const QUOTATION_KEYS = ['quotations', 'leads-for-quotation', 'dashboard-stats'];

const PROJECT_KEYS = [
  'projects-admin', 'all-projects', 'projects-for-lead', 'lead-projects',
  'leads-for-project', 'customers-for-project', 'customer-projects',
];

const DEMO_KEYS = ['demos', 'leads-for-demo', 'dashboard-stats'];

const IMPLEMENTATION_KEYS = [
  'implementations', 'customers', 'leads-for-impl', 'meeting-report-implementations', 'dashboard-stats',
  // The Customer main table's per-Project Status/Stage accordion
  // (src/components/customers/CustomerProjectsPanel.tsx) reads a Project's
  // Implementation the same way the Implementations module itself does.
  'customer-projects',
];

const INVOICE_KEYS = [
  'accounting-invoices', 'accounting-dashboard-stats', 'leads-for-invoice', 'dashboard-stats',
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
