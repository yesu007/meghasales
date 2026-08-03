# Admin Ticket: Card/List Toggle + Advance Filter (2026-08-03)

## What changed

The Admin Tickets page (`src/app/dashboard/admin-ticket/page.tsx`) was a
single table with a row of status buttons and a "New Ticket" modal. It's now:

- **Card / List view toggle**, defaulting to Card. Card view shows one card
  per ticket: ticket no + title, category, a status-stage progress bar,
  assignee avatar, due date, and priority/status badges. List view is the
  original inline-editable table, unchanged.
- **Status tabs with live counts** — All/Open/In Progress/Pending/
  Completed/Cancelled, each showing a count that reflects the *other* active
  filters (search/assignee/priority/category/due date), not just the
  currently selected tab.
- **Search box** — matches ticket title or ticket number, debounced 300ms.
- **Advance Filter modal** — a left-nav + right-panel modal (Assignee,
  Priority, Category, Due date), each a multi-select checkbox list except
  Due date (from/to date inputs). Draft state only commits on "Apply";
  "Close" discards, "Clear all" resets the draft.

Backend (`src/app/api/admin-ticket/tickets/route.ts`) gained:
- `search` (title/ticketNo, case-insensitive `contains`)
- Comma-separated multi-value `assignedToId`, `priority`, `categoryId`
  (previously single-value only)
- `dueDateFrom` / `dueDateTo` range
- `statusCounts` in the response, computed via `groupBy` against every
  filter **except** status — so switching tabs never collapses the other
  tabs' counts to zero.

## Why this shape

The ask was to reproduce a reference UI screenshot (a generic "Projects"
board — List/Card toggle, Pinned/Paused/Archived tabs, task-checklist
progress bars, free-form Tags, multi-collaborator filter). Several of those
concepts don't exist in the `AdminTicket` model: no pinned flag, no tags, no
sub-task checklist, and a single `assignedToId` rather than multiple
collaborators. Given the "full layout restructure" scope the user picked
(vs. a purely visual reskin), the redesign keeps the reference's *structure*
(tabs+counts, search+filter row, card grid, advance-filter modal) but maps
each piece to a real field instead of inventing data:

- No checklist → the card's progress bar is a **fixed per-status stage
  marker** (OPEN 8%, IN_PROGRESS 50%, PENDING 75%, COMPLETED/CANCELLED
  100%), not a measured completion percentage. Explicitly commented in
  `STATUS_PROGRESS` as non-measured, to avoid a future reader assuming it's
  real task-completion data.
- No tags/pinned/archived → dropped entirely rather than faked.
- Collaborators (multi-select) → Assignee (multi-select), since
  `assignedToId` is single-valued per ticket but the *filter* can reasonably
  ask "show me tickets assigned to any of these people."

## Verification

No production admin tickets existed locally to check against, so the change
was verified with local-only fixture data (5 tickets spanning all 5
statuses, assigned to different users, one unassigned) inserted directly via
`psql` against the local dev Postgres, then a headless-Chromium (Playwright)
screenshot of: Card view, the Advance Filter modal (Assignee and Priority
tabs), and List view — logged in as `admin@tekfilo.com` via the NextAuth
credentials callback, feature flag `NEXT_PUBLIC_FEATURE_ADMIN_TICKET`
temporarily set to `true` in `.env.local` (this flag is not set in local
`.env`/`.env.local` by default — only in prod). Confirmed via direct API
calls that `search`, `priority`, and comma-separated `assignedToId` filters
each returned the correct subset. Fixture data and the env override were
removed after verification; no test data or flag changes were committed.

## Related

Built the same session as a similar redesign of the Accounting Dashboard
(multi-currency KPI cards, Cash Flow/Money In/Outstanding sections) — see the
git log around commits `b741bda` and `96411b3` for that work; no separate
doc was written for it since the accounting fixes were narrower (bug fixes
in `dashboard-stats/route.ts`) layered under a similar visual restructure.
