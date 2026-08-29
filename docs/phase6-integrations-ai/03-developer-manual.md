# Developer manual: Meeting Management module (Phase 6 handoff)

Reference for whoever picks up Phase 6 — Integrations & AI on the Meeting
Management & Follow-Up module. Phases 1–5 are done and live in production;
this documents the conventions those phases established so Phase 6 work
(and any future work on this module) stays consistent with them, plus how
the two Phase 6 features (§01, §02 of this folder) fit in.

Full historical design: the "Meeting Lifecycle Blueprint" artifact
(`https://claude.ai/code/artifact/cd62f0b9-1cbb-4f98-b6c9-51c224a97fab`) —
re-read it before starting new work; it has the full DB/API/RBAC/SLA design
the build has followed. Routes/pages were later renamed from
`/api/meetings`, `/dashboard/meetings` to `/api/todo`, `/dashboard/todo`
(UI label "Meetings" → "To Do") — same module, relocated.

## Module layout

```
src/lib/meetings/
  constants.ts                      # status enums, SLA_OFFSETS_BY_PRIORITY, classifyActionItemSlaStatus()
  meetingService.ts                 # Meeting CRUD, recurrence, conflict checks
  momService.ts                     # Mom CRUD, versioning, approve/publish workflow
  actionItemService.ts              # ActionItem CRUD, status-transition graph, dependencies
  actionItemReminderMaterializer.ts # recomputes PENDING ActionItemReminder rows on due-date/priority change
  actionItemReminderDispatcher.ts   # sends due reminders via notificationTemplates.ts
  notificationTemplates.ts          # {{token}} rendering, per-channel dispatch, notifyManyViaTemplate()
  dashboardService.ts               # three-tier dashboard aggregation queries
  reportsService.ts                 # filtered/exportable action-item report
  featureFlag.ts                    # NEXT_PUBLIC_FEATURE_MEETINGS gate

src/app/api/
  todo/, todo/[id]/, todo/[id]/cancel/, todo/[id]/reschedule/
  action-items/, action-items/[id]/, action-items/followups/
  reminders/action-items/generate/    # cron + on-demand piggyback dispatch entry point
  meetings/dashboard/, meetings/reports/
  settings/notification-templates/    # admin CRUD for NotificationTemplate content

src/lib/assistant/     # separate AI-assistant module (see "AI SDK conventions" below) — Phase 6 AI work extends this, doesn't duplicate it
```

Each service file is a plain function module — no classes, no DI container.
API routes call the service functions directly; UI pages call the API
routes. Tests (`*.test.ts`) sit next to the file they test.

## Schema conventions (read before adding any column)

- **Loose refs, not FKs, to `User`.** `organizerId`, `assignedToId`,
  `createdById`, `verifiedById`, etc. are plain `Int?` columns with a
  comment `// loose ref to User.id`, not Prisma relations. This is
  deliberate and consistent across the whole module (and the codebase more
  broadly) — don't "fix" one into a real FK without checking whether that's
  actually wanted; it would be a schema-wide inconsistency to fix in
  isolation.
- **Polymorphic link via `refType`/`refId`.** `Meeting.refType`/`refId` and
  `ActionItem.refType`/`refId` loosely link to `"LEAD" | "IMPLEMENTATION" |
  "ADMIN_TICKET"` rows, no FK (can't FK across polymorphic tables). Any new
  cross-entity link (e.g. linking a calendar-sync record to a `Meeting`)
  should follow the same shape unless it's a link that only ever points at
  one target type — then a real FK is fine (see `ActionItemReminder.actionItemId`).
- **`version: Int @default(1)`** on `Meeting`, `Mom`, `ActionItem` is an
  optimistic-lock token for concurrent edits — any new mutation on these
  models must bump it and check it, matching the existing update handlers.
- **Append-only `*Activity`/`*History` vs. `*Comment`.** `MeetingActivity`,
  `ActionItemHistory` are system-generated field-change/status trails,
  separate from human freeform discussion (`ActionItemComment`). If Phase 6
  work needs to log something, decide which bucket it belongs in rather than
  overloading one table for both purposes.
- **Enums are plain `String` columns with a `//`-comment listing the valid
  values**, not Postgres enums or a `StatusMaster` lookup table — `git grep`
  the comment before adding a new status value so UI label logic
  (`leadStatus.ts`-style constant maps) stays in sync.

## Status-transition & permission pattern

`ActionItem.status` transitions are gated per-transition, not just per-route
— e.g. `assign_action_items` for `DRAFT → ASSIGNED`, `verify_action_items`
for `→ VERIFIED`, `close_action_items` for `→ CLOSED`, with a dependency
check blocking a transition if `dependsOnActionItemId` isn't itself
resolved. Any new status-affecting code path (including an AI-accept flow,
per `02-ai-mom-action-item-extraction-approaches.md`) must go through the
same transition function in `actionItemService.ts`, not write `status`
directly — that function is where the permission + dependency checks live.

## SLA / notification pattern

- `SLA_OFFSETS_BY_PRIORITY` (`constants.ts`) defines per-priority reminder
  offsets (negative = advance warning, ≥0 = overdue escalation).
- The **materializer** recomputes `PENDING` `ActionItemReminder` rows
  whenever an item's due date or priority changes — it deletes/regenerates
  rather than patching in place.
- The **dispatcher** sends due `PENDING` reminders, run two ways: a
  once-daily Vercel cron hitting `/api/reminders/action-items/generate`,
  **and** piggybacked on-demand inside `GET /api/action-items` — this
  dual-trigger is how the Hobby-plan one-cron-run/day ceiling was resolved
  (blueprint's design doc option 3, §10/§18). Don't remove the piggyback
  call assuming the cron alone is sufficient unless the Vercel plan has
  changed.
- `notifyManyViaTemplate()` is channel-agnostic already — adding
  `WHATSAPP`/`SMS` (per `01-integration-providers.md`) is a new `channel`
  case in `dispatchTemplatedNotification()` plus a new `send*` function next
  to the existing `sendMail` call, not a parallel system.
- Known gap: the design doc specced a `notification_preferences` table
  (per-user channel opt-in/out); only an admin-level per-template
  `isActive` toggle exists. Confirm whether this is still deferred before
  Phase 6 adds more channels on top of a system with no per-user opt-out.

## AI SDK conventions (`src/lib/assistant/`)

- Model is a plain Vercel AI Gateway string
  (`'anthropic/claude-sonnet-5'` today) — re-fetch
  `https://ai-gateway.vercel.sh/v1/models` before hardcoding a slug in new
  code; it was fetched fresh rather than assumed from memory the first time.
- `createAssistantTool()` wraps `ai`'s `tool()` so every tool is
  session-checked and `checkPermission()`-gated before its handler runs; a
  denial is returned as `{error: 'permission_denied' | 'unauthorized'}`, not
  thrown, so a `ToolLoopAgent` can react to it in its next turn.
- Phase 6 AI work (MOM drafting / action-item extraction, see
  `02-ai-mom-action-item-extraction-approaches.md`) should call
  `generateObject`/`streamObject` directly for the no-tools extraction path,
  and only reach for a second `ToolLoopAgent` + new `createAssistantTool`
  entries if a cross-referencing (agentic) approach is actually adopted.
  Either way: reuse this module's model-string source and permission-gate
  pattern, don't stand up a second AI integration path.

## Testing conventions

- Unit tests co-located as `*.test.ts` (status-transition graph edges, SLA
  offset math, template token rendering).
- No browser-automation tooling has been available in past sessions on this
  module (`chromium-cli`/Playwright launches were denied by the sandbox) —
  verification has instead been direct `curl` against a local dev server
  exercising the full flow, then the same read-only checks repeated against
  **production** after deploy to confirm the migration actually applied
  against Neon (not just local Postgres). If browser automation is
  available when Phase 6 work happens, use it — don't assume the same
  constraint holds.
- For schema changes: hand-author the Prisma schema diff + raw migration SQL
  (no local DB access in past sessions — verified by cross-checking
  migration columns against schema fields, not by running
  `prisma migrate dev`). Confirm this constraint still holds before
  assuming it.

## Build pattern for a new Phase 6 sub-feature

1. Re-read the blueprint artifact section for that sub-feature (§13's Phase
   6 row, §19).
2. Hand-author the Prisma schema + migration SQL (credential storage for
   calendar OAuth, new `channel` enum values, etc.), following the loose-ref
   / polymorphic-link / version-column conventions above.
3. A data-only permission-seed migration if a new permission is needed
   (e.g. gating who can trigger an AI draft, or reconfigure calendar sync).
4. A service-layer file in `src/lib/meetings/` (or a new tool/service under
   `src/lib/assistant/` for the AI path) — this is where business logic and
   the human-confirm gate live, not in the route handler.
5. API routes under `src/app/api/`, mirroring the existing route shape for
   the closest analogous feature.
6. Delegate UI work to a fresh subagent with the finished API contract to
   read, once the above is solid.
7. **Deploy**: commit, push, `vercel --prod --yes` — migrations auto-run on
   deploy, seeding does not (run any new seed script manually against
   prod). Verify a deploy claim by reading actual Vercel build logs
   (`vercel inspect <url> --logs`, grep "Applying migration" / errors)
   rather than trusting a subagent's summary.
