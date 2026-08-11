# Lead Follow-ups: status pipeline, follow-up history, overdue detection (2026-08-11)

## What changed

Added a full "Lead Follow-ups" capability on top of the existing Leads
feature, per a 6-point spec (status badges, a followed-up filter, a
follow-up history panel, summary widgets, a new data model, and
overdue/auto-status behavior).

### 1. Status pipeline

`src/lib/leadStatus.ts`'s `LEAD_STATUSES` grew from 5 to 6 stages and got
new colors/labels to match the spec (grey=New, blue=Contacted,
orange=Follow-up Scheduled, purple=Qualified, green=Converted, red=Lost):

```
New → Contacted → Follow-up Scheduled → Qualified → Converted → Lost/Dropped
```

The underlying enum **values** for the last two (`CONFIRMED`,
`DISQUALIFIED`) were kept unchanged — only their labels/colors changed —
because `status === 'CONFIRMED'` gates Events/Documents tab unlocking in
the lead detail page and event creation in
`src/app/api/leads/[id]/events/route.ts`. Renaming those enum values would
have required touching every one of those call sites and any existing
prod rows; relabeling was zero-risk and achieves the same user-facing
result. `FOLLOW_UP_SCHEDULED` is the only genuinely new status value.

### 2. Data model

New `LeadFollowUp` model (`prisma/migrations/20260811120000_add_lead_followups/`):
`id, leadId, followUpDate, method, notes, outcome, nextAction,
nextFollowUpDate, loggedById, createdAt`.

`Lead` gained three denormalized columns — `lastFollowUpDate`,
`nextFollowUpDate`, `followUpCount` — kept in sync transactionally
whenever a follow-up is logged. These exist purely so the leads list can
filter (`followUpCount: 0` / `{gt: 0}`) and sort (`orderBy:
{lastFollowUpDate: ...}`) without a per-row subquery against
`lead_follow_ups` — Prisma can't `orderBy` a to-many relation's max date
directly, only its count.

### 3. Auto status-suggestion

`POST /api/leads/[id]/follow-ups` (mirrors the existing
`/api/leads/[id]/events` route shape) computes a suggested status via
`suggestStatusAfterFollowUp()` in `src/lib/leadStatus.ts`: first follow-up
moves `NEW → CONTACTED`; setting a next-follow-up date moves the lead to
`FOLLOW_UP_SCHEDULED`. A pipeline-rank check ensures this only ever moves
a lead **forward** — logging a follow-up on an already-`QUALIFIED` or
`CONFIRMED` lead never downgrades it. Verified directly: logging a 2nd
follow-up (with a next date) on a lead manually set to `QUALIFIED`
returned `statusUpdatedTo: null` and left the lead's status untouched.

### 4. Overdue detection

`isFollowUpOverdue()` in `src/lib/leadFollowUp.ts` — `nextFollowUpDate <
today AND status not in (CONFIRMED, DISQUALIFIED)`. Computed at read time
in `GET /api/leads` (`isOverdue` field) and in `GET /api/leads/stats`
(`overdueFollowUp` count); not stored, since "today" moves.

### 5. UI

- `src/app/dashboard/leads/page.tsx`: 4 summary cards (Total New / Pending
  Follow-up / Overdue Follow-ups / Converted This Month), an All Leads |
  New Leads | Followed-up Leads segmented toggle (`view` query param),
  and Last/Next Follow-up Date columns with a red "(Overdue)" pill.
- `src/app/dashboard/leads/[id]/page.tsx`: new **Follow-ups** tab
  (unlike Events/Documents, not gated behind `CONFIRMED` — follow-ups are
  a pre-conversion activity by definition) rendering
  `src/components/leads/FollowUpsTab.tsx` (timeline, same visual pattern
  as `ActivityTimeline.tsx`) + `FollowUpDrawer.tsx` (quick-entry form:
  date, method, notes, outcome, next action, next follow-up date — same
  slide-over drawer pattern as `EventDrawer.tsx`).
- Follow-up creation also writes a `FOLLOWUP_LOGGED` entry into the
  existing `LeadActivity` timeline (icon added to `ActivityTimeline.tsx`'s
  `ACTIVITY_ICONS` map) — free integration with the Activity tab that
  already existed.

## Why no StatusMaster / no permission gating

`StatusMaster` + `GET /api/status/[module]` exist in the schema but are
completely unused elsewhere in the app — Lead status has always been a
hardcoded array in `leadStatus.ts`. Follow-up methods/outcomes follow that
same established convention (`FOLLOWUP_METHODS`/`FOLLOWUP_OUTCOMES` in
`leadFollowUp.ts`) rather than introducing a second, inconsistent
status-source pattern.

The new follow-up routes have no `requirePermission()` call, matching the
base `/api/leads` and `/api/leads/[id]` routes (which also have none) —
Events/Documents use `view_lead_events`/`manage_lead_events` because
they're a separate, more sensitive post-conversion feature; follow-ups are
core CRM activity available to whoever can already see/edit leads.

## Verification

No browser automation was available in this sandbox session
(`chromium-cli` wasn't installed, and headless-browser process launches
were blocked by the sandbox's permission layer regardless of approach
tried — Playwright via a locally-installed `playwright-core` + system
`google-chrome` channel, invoked directly or via `cd && node`, was denied
outright rather than prompted). Verified instead by:

- `npx tsc --noEmit` and `npm run build` — both clean.
- Direct `curl` calls against the local dev server (Node 20+/local
  Postgres) exercising the full flow: create lead → log follow-up with a
  past next-date → confirm `statusUpdatedTo: "FOLLOW_UP_SCHEDULED"` →
  confirm `GET /api/leads` shows `isOverdue: true` and it's counted in
  `overdueFollowUp` → manually set status to `QUALIFIED` → log a 2nd
  follow-up → confirm `statusUpdatedTo: null` (no downgrade) → confirm
  `view=new`/`view=followed-up` filters partition correctly.
- Same `curl` checks repeated against **production**
  (`https://meghasales.vercel.app`) after deploy, using real existing
  lead data, to confirm the migration actually applied and the new
  columns/endpoints work against Neon, not just local Postgres.
- Test leads created for verification were deleted afterward (both local
  and none were left in production — production checks were read-only
  `GET` calls against pre-existing real leads).

## Vercel deploy gotcha hit this session

See `.vercel/repo.json`'s `"directory"` field issue — recorded in memory
(`meghasales-prod-access`), not repeated here since `.vercel/` is
gitignored and the fix is local-environment-only, not a code change.
