# Customer module detail page, invoice navigation fix, and Expense Categories CRUD (2026-08-29)

## What changed

Today's work spans local environment setup, a new Customer module detail
page mirroring the Leads module, two follow-up UI passes on its vertical
tabs, an invoice-view navigation-context bug fix, a small styling
consistency fix, and a full CRUD build-out for Expense Categories /
Sub-Categories (previously create-only).

### 1. Local dev environment

- The local DB (`meghasales_next`) didn't exist; created it, ran all
  pending Prisma migrations, and seeded it
  (`admin@tekfilo.com` / `admin123`, ADMIN role, per `prisma/seed.ts`).
- `NEXT_PUBLIC_FEATURE_ADMIN_TICKET`, `NEXT_PUBLIC_FEATURE_MEETINGS`,
  `NEXT_PUBLIC_FEATURE_PAYROLL` weren't set in `.env`. These feature flags
  are independent of RBAC (see `src/lib/adminTicket/featureFlag.ts`,
  `src/lib/meetings/featureFlag.ts`, `src/lib/payroll/featureFlag.ts`) and
  were hiding those nav sections for every user, admin included. Enabled
  all three.
- Repo history: `origin/main` was merged with the `yesudas` branch
  (Verticals / Customers / Expense Budgets) and the `deployment` branch
  (Docker infra); the local checkout ended up on a new `Features/Customer`
  branch tracking that merge. `.env` isn't tracked on this branch (a
  "Stop tracking .env" commit landed in the merge), so it gets deleted by
  git on certain branch switches — recreated it twice during the day, and
  re-ran the migrations/seed that came in with the merge.
- Hit a stale-Prisma-Client / migration-drift issue twice:
  - `Unknown field 'subCategories' for include statement on model
    'ExpenseCategory'` — schema had the field, client was stale; fixed
    with `npx prisma generate`.
  - `The table 'public.expense_sub_categories' does not exist` — 4
    migrations from the merge (`add_expense_sub_category`,
    `seed_expense_categories`, `add_quotation_resource_based_costing`,
    `delete_unused_expense_categories`) hadn't been applied locally; fixed
    with `npx prisma migrate deploy` + `npx prisma generate`.

### 2. Customer module: detail page (new)

`src/app/dashboard/customers/[id]/page.tsx` (new file).

- A Customer is a Lead with `status = CONFIRMED` — no separate entity
  (documented at the top of `src/app/dashboard/customers/page.tsx`). The
  Company-name link and the View action in the Customers list now go to
  `/dashboard/customers/:id` instead of reusing `/dashboard/leads/:id`.
- Structure mirrors the Lead detail page
  (`src/app/dashboard/leads/[id]/page.tsx`) closely: same header (back
  arrow, company/contact line, status pill), same `Tab.Group` pattern,
  reuses `EventsTab`, `LeadDocumentsTab`, `ActivityTimeline` from
  `src/components/leads/*` completely unmodified — all three already take
  a generic `leadId` prop.
- Tabs: **Overview, Events, Documents, Activity** — Follow-ups was
  intentionally left out (not meaningful once a lead has converted).
- The selected tab persists across a browser refresh via a `?tab=` query
  param (`TAB_KEYS` array, synced through `useSearchParams` /
  `router.replace`). The Lead detail page doesn't need this since it's
  never deep-linked to a specific tab.
- The Leads module itself (`src/app/dashboard/leads/**`,
  `src/components/leads/**`) has zero diff from any of today's work.

### 3. Vertical tab layout (two follow-up passes)

Converted the tab bar from a horizontal row to a left sidebar: `flex-col`
from the `sm:` breakpoint up, `border-r` divider instead of `border-b`,
active-tab indicator moved from a bottom border to a right border, and
`vertical` added to `Tab.Group` for correct Up/Down keyboard navigation.

Two corrections after visual review:

1. First pass added `sm:items-start` to the wrapping flex row, to stop the
   sidebar's divider from stretching past its own last tab button into
   blank space when the content next to it was very tall.
2. Second pass **reverted** that — the actual requirement was the
   opposite: the sidebar should grow/shrink to match whichever tab's
   content is currently active. Removing the override restores plain
   flexbox `align-items: stretch` (the default), which does exactly that.
   In the same pass, removed the browser's native black focus
   outline/ring on tab-button click by adding `focus:outline-none` to all
   six `<Tab>` class strings — the existing amber selected-state border
   remains the sole visual indicator of the active tab.

### 4. Invoices / Paid Invoices tabs on the Customer detail page

- `src/components/accounting/InvoiceListPage.tsx` gained an **optional**
  `leadId?: number` prop. When set, it pins the invoice list to that
  customer (via the `leadId` query param the API already supported) and
  hides the standalone "All Customers" filter dropdown. The two existing
  Accounting pages (`pending-invoices`, `paid-invoices`) don't pass it, so
  their behavior is unchanged.
- Two new tabs on the Customer detail page: **Invoices** (renders
  `<InvoiceListPage mode="open" leadId={customer.id} />`) and **Paid
  Invoices** (`mode="paid"`) — no new backend at all; reuses
  `/api/accounting/invoices?leadId=` which already existed for the
  standalone pages' own customer filter.

### 5. Invoice-view navigation-context bug fix

**Problem:** clicking "View" on an invoice from a Customer's
Invoices/Paid Invoices tab navigated to the Accounting module's invoice
route, and its Back button always returned to Accounting — losing the
customer context entirely.

**Rejected first attempt:** carrying `?from=customer&customerId=&tab=`
query params on the Accounting URL. Explicitly rejected — the invoice
needed to open under a real Customer-module route, not an
Accounting-module URL wearing a query-param disguise.

**Final fix:**

- Extracted the invoice detail UI into
  `src/components/accounting/InvoiceDetail.tsx` (new) — a route-agnostic
  component taking `invoiceId` and `backHref` props. No duplicated UI.
- `src/app/dashboard/accounting/invoices/[id]/page.tsx` — now a thin
  wrapper: same URL, `backHref="/dashboard/accounting/pending-invoices"`,
  byte-identical behavior to before.
- `src/app/dashboard/customers/[id]/invoices/[invoiceId]/page.tsx` (new)
  — a genuine child route under the Customer module. Its `backHref` is
  derived from the invoice's own `status` field (`PAID` → back to the
  `paid-invoices` tab, anything else → `invoices` tab) — no query param
  ever carries "source" information.
- `InvoiceListPage`'s View link: `leadId ? /dashboard/customers/${leadId}/invoices/${inv.id} : /dashboard/accounting/invoices/${inv.id}`.

### 6. "Converted" status dropdown corner radius

`rounded-full` → `rounded-lg` on the status `<select>` in both
`src/app/dashboard/leads/[id]/page.tsx` and
`src/app/dashboard/customers/[id]/page.tsx`, to match the "New Lead"
button's corner style. Colors (from `leadStatusColor()`), text, the
native dropdown arrow, size, padding, and `onChange`/`disabled` behavior
are all untouched — this is the only class changed in either file for
this task.

### 7. Expense Categories / Sub-Categories: table redesign + CRUD

Previously create-only: no Edit/Delete/View anywhere, no `[id]` API
routes for either entity, and sub-categories were only shown as a
comma-separated list embedded inside each category's row (no standalone
Sub-Category table).

**New API routes** (follow this module's existing conventions —
`requirePermission('manage_expenses')`, `logAudit`, P2002 unique-conflict
handling):

- `src/app/api/expenses/categories/[id]/route.ts` (new) — `PUT`
  (name/description), `DELETE` (blocks with `409` if the category still
  has sub-categories, expenses, or budgets referencing it).
- `src/app/api/expenses/sub-categories/[id]/route.ts` (new) — `PUT` (name
  only — `categoryId` is intentionally not accepted, so a sub-category
  can never be reparented via edit), `DELETE` (blocks with `409` if any
  expense references it).
- The two collection routes (`categories/route.ts`,
  `sub-categories/route.ts`) keep their existing `GET`/`POST` contract
  unchanged — only their "no `[id]` route" comments were updated.

**UI** (`src/app/dashboard/expenses/page.tsx`):

- Split the old single "Expense Categories" card into two independent
  sections — **Expense Categories** and a new **Expense Sub Categories**
  table (flattened across all categories) — both styled to match the
  Leads main table exactly: dark `bg-slate-900` header row, alternating
  row shading with amber hover, and a right-aligned **Actions** column
  using the same Eye/Pencil/Trash icon buttons (and hover colors) as the
  Leads table.
- **Add Category** / **Add Sub Category** buttons restyled to match **New
  Lead** (filled `bg-amber-600 rounded-lg` button instead of a text link)
  — same click handlers, same forms.
- View and Edit both open the same pre-filled inline form (an explicit
  choice — no separate read-only view screen exists for either entity);
  the submit label switches to "Save Changes" in edit mode. Sub-Category
  edit disables the parent-category dropdown so the
  Category↔Sub-Category relationship can't be changed through the UI.
- The "Record Expense" form/table above this section (unrelated to
  Categories) is untouched.

**Tested** all 8 flows directly against the live API: Category
View/Edit/Delete/Add, Sub-Category View/Edit/Delete/Add — including both
blocked-delete cases (category with a sub-category attached; sub-category
with an expense attached) and confirming a sub-category delete never
disturbs its parent category or sibling sub-categories.

## Files touched

**New:**
- `src/app/dashboard/customers/[id]/page.tsx`
- `src/app/dashboard/customers/[id]/invoices/[invoiceId]/page.tsx`
- `src/components/accounting/InvoiceDetail.tsx`
- `src/app/api/expenses/categories/[id]/route.ts`
- `src/app/api/expenses/sub-categories/[id]/route.ts`

**Modified:**
- `src/app/dashboard/customers/page.tsx`
- `src/app/dashboard/leads/[id]/page.tsx`
- `src/app/dashboard/accounting/invoices/[id]/page.tsx`
- `src/components/accounting/InvoiceListPage.tsx`
- `src/app/dashboard/expenses/page.tsx`
- `src/app/api/expenses/categories/route.ts`
- `src/app/api/expenses/sub-categories/route.ts`
- `.env` (local only — feature flags, not committed)

## Not changed

- The Leads module (list + detail, `src/app/dashboard/leads/**`,
  `src/components/leads/**`) — zero diff across every task above.
- The standalone Accounting `pending-invoices` / `paid-invoices` pages —
  behavior is byte-identical (the `leadId` prop on `InvoiceListPage` is
  optional and additive).
- Expense data model, the main `/api/expenses` (expense record) routes,
  and the Category↔Sub-Category relationship itself.
