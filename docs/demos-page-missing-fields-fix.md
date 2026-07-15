# Demos Page: Missing Fields Fix (2026-07-15)

## Issue

The Demos page (`src/app/dashboard/demos/page.tsx`) was missing UI for four fields:
Assigned To, Next Action, Interest, and the ability to reschedule a demo's date.

## Root cause

The Prisma schema and API routes (`src/app/api/demos/route.ts`,
`src/app/api/demos/[id]/route.ts`) already fully supported `assignedToId`,
`customerInterestLevel`, `nextAction`, and `scheduledDate` updates. The gap was
entirely in the frontend — the page only rendered a bare create form and a
status dropdown; no controls existed for the other fields. The list API also
omitted `assignedToId` from its response, so even a correct UI control would
have had nothing to pre-fill from.

**This is a recurring pattern in this codebase**: the Next.js frontend pages
were built as a rewrite of an older Spring Boot app
(`/Users/yesudassudhakar/meghasales-backup-springboot`) and are often thinner
than the backend they're rewriting. When a "field is missing" bug is reported:

1. Check the Prisma schema + API route first — it's frequently already done.
2. Check the equivalent page in the Spring Boot frontend
   (`meghasales-backup-springboot/frontend/src/pages/`) for the original UX
   and business rules (e.g. which statuses make a field editable, what the
   dropdown options should be).
3. The gap is almost always: the list/GET API response is missing a raw ID
   field (e.g. `assignedToId`) needed to pre-fill an editor, and/or the page
   simply never got a control built for it.

Worth checking the same pattern on Leads, Quotations, and Implementations
pages if similar "field missing" reports come in.

## Fix applied

- `src/app/api/demos/route.ts`: added `assignedToId` to the list response.
- `src/app/dashboard/demos/page.tsx`:
  - Added a `fetchUsers()` call + **Assign To** select to the create form and
    as an inline-editable select per table row (same pattern as the Leads
    page's BA-assignment dropdown).
  - Added inline-editable **Interest** and **Next Action** selects, gated by
    demo status: hidden until a demo is `IN_PROGRESS` or `COMPLETED` (or
    already has a saved value), since rating customer interest / picking a
    follow-up action doesn't make sense before the demo has happened.
  - Made the **Scheduled Date** cell an editable `datetime-local` picker when
    status is `SCHEDULED` or `RESCHEDULED`; changing it saves the new date and
    flips status to `RESCHEDULED` in one call. Read-only once a demo is
    `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`.
  - `NEXT_ACTIONS` options (`SCHEDULE_DEMO_2`, `SEND_QUOTATION`,
    `REQUIREMENT_GATHERING`, `FOLLOW_UP`) were taken from the original
    Spring Boot app's "Complete Demo" modal.
  - Consolidated row-level PUT calls into one `updateDemo(id, patch, msg)`
    helper.

## Verifying without a browser

No browser automation tool was available in-session. Verified instead by
running `npm run dev` (needs Node >= 18.17, see below) against the local
Postgres instance and calling the API routes directly with `curl` — the
Demos API routes have no auth/session check, so they're directly testable:
create → check list response shape → change status → set fields → confirm via
list endpoint (what the table actually renders) → clean up test row with
`DELETE /api/demos/{id}`.

## Dev environment notes

- Local Node is v16.13.2 — too old for Next.js 14 (needs >=18.17.0). Use:
  ```
  source ~/.nvm/nvm.sh && nvm use 20.20.1
  ```
  before `npm run dev` / `next lint`.
- Local Postgres (`meghasales_next` db, `postgres`/`postgres`) backs
  `DATABASE_URL` in `.env`. Seed data: 2 users (Admin User id 1, BA User id 2),
  1 lead (Golden Touch Jewellers id 1).

## Push procedure for this repo

`origin` is `git@github.com:yesu007/meghasales.git` (SSH). The local
`~/.ssh/id_ed25519` key is registered on GitHub for the `yesu007` account, but
the private key is **passphrase-protected**. A sandboxed/non-interactive shell
has no TTY to prompt for it, so `git push` fails with
`Permission denied (publickey)` even though the key itself is correct and
registered.

Fix: unlock the key in the macOS `ssh-agent` from a real (interactive)
terminal — not from a sandboxed tool shell:

```
ssh-add ~/.ssh/id_ed25519
```

Enter the passphrase when prompted. Because it's the same system
`ssh-agent` (`SSH_AUTH_SOCK`), subsequent `git push` calls from any shell —
including a sandboxed one — will succeed without needing the passphrase again,
until the agent identity is flushed (e.g. reboot, `ssh-add -D`).

Sanity checks if push still fails:
- `ssh-add -l` — confirms the key is loaded in the agent.
- `ssh -T git@github.com` — should greet you as `yesu007`.
- Note: the `gh` CLI in this environment is authenticated as a *different*
  GitHub account (`devbigdraw`) with only read access to this repo — `gh`
  auth status is not a substitute for the SSH key check above.
