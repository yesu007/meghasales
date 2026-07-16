# Production migrations gap + editable quotation module amount (2026-07-17)

## Symptom

User report: "no leads found, existing leads are not showing, and creating a
new lead the country is not showing in the dropdown." Later, the same report
came in specifically **for the production server** after the local dev issue
was already fixed.

## Root cause #1 (local): wrong Node version

Local shell's default `node` resolved to `/usr/local/bin/node` (Homebrew,
v16.13.2) instead of the nvm-installed v20.20.1, because `~/.zshrc` tried to
pin PATH to nvm's node via:

```zsh
export PATH="$HOME/.nvm/versions/node/$(node -v)/bin:$PATH"
```

`node -v` runs *before* nvm has switched anything, so it resolved to the
Homebrew v16 binary first — the nvm prepend pointed at a directory that
didn't exist. Next.js 14 requires Node >=18.17 and refuses to boot on v16.

**Fix**: replaced that line with `nvm use default` (an alias already pointing
at v20.20.1 was already configured). Verified with a fresh non-interactive
shell: `node -v` → `v20.20.1`.

## Root cause #2 (production): migrations never applied to the prod DB

`package.json`'s `build` script was:

```json
"build": "npx prisma generate && next build"
```

This regenerates the Prisma **Client** from `schema.prisma` (so the code
compiles against the new `Country`/`countryId` types) but never actually runs
`prisma migrate deploy` against the real database. Three migrations from the
Country Master / multi-currency work
(`20260716174757_add_country_master`, `20260716180000_backfill_country_master`,
`20260716180516_add_invoice_exchange_rate`) had been merged and deployed to
Vercel, but the production Postgres (Neon) schema was never updated to match.
At runtime, every `/api/leads` and `/api/countries` query threw (missing
table/columns), caught and turned into a bare 500 — the UI just rendered an
empty leads list and an empty country dropdown, with nothing more specific
surfaced.

Confirmed via `vercel env pull` + manual `npx prisma migrate deploy` against
production: it reported 3 pending migrations and applied them successfully.
Leads and the country dropdown came back immediately after, with no code
changes needed on the production side.

**Permanent fix**: `package.json:7`

```json
"build": "npx prisma generate && npx prisma migrate deploy && next build"
```

## Root cause #3 (production build failure after the fix above): Neon cold start

The very next deploy (commit `fc5f97f`, which included the fix above) failed
outright:

```
Error: P1002
The database server at `ep-spring-boat-ahvz2h6c...aws.neon.tech:5432` was
reached but timed out.
Context: Timed out trying to acquire a postgres advisory lock
(SELECT pg_advisory_lock(...)). Elapsed: 10000ms.
```

Neon (serverless Postgres) suspends its compute when idle and wakes it on
the first connection; that wake-up can exceed Prisma's ~10s advisory-lock
acquisition timeout, failing the whole build even though nothing is actually
wrong with the migrations (the DB was already fully migrated by that point —
`prisma migrate deploy` never got far enough to log anything before timing
out on the lock).

**Fix**: `package.json:7`, retry the command once —

```json
"build": "npx prisma generate && (npx prisma migrate deploy || npx prisma migrate deploy) && next build"
```

Confirmed on the next deploy (commit `69e9cde`): built clean on the first
attempt (Neon was already warm from the prior failed run) — log showed
`No pending migrations to apply.` and `Build Completed`.

## Feature added in the same push: editable module amount in Create Quotation

Unrelated feature request surfaced in the same session: in Create Quotation
→ "Select Business Modules", the price for each selected catalog module
(Trading/Jewellery/Manufacturing/etc.) was fixed — only *custom* modules had
an editable cost field. Added:

- `src/app/api/quotation-config/calculate/route.ts`: accepts an optional
  `moduleOverrides: Record<moduleCode, number>` in the POST body. When a
  module has an override, its `basePrice` in the response uses that instead
  of `baseLicenseCost` converted at the current exchange rate. Flows through
  unchanged into `modulesSubtotal` → `subtotal` → tax → `grandTotal`, so an
  overridden module is still taxed correctly.
- `src/app/dashboard/quotations/page.tsx`: new `moduleOverrides` state; an
  editable amount input per selected module (under "Select Business
  Modules", defaulting to the catalog price); clears a module's override
  when it's deselected; `openEdit` restores the exact amounts a saved
  quotation was quoted at (read from `pricingSnapshot.modules`) instead of
  recomputing from today's catalog price/exchange rate.

Verified directly against `/api/quotation-config/calculate`: overriding
`TRADING` from ₹250,000 → ₹12,345 correctly reduced `modulesSubtotal`,
`totalTax`, and `grandTotal`.

## Commits

- `9bc43f9` — Run pending migrations automatically during build
- `fc5f97f` — Allow editing selected module amounts in Create Quotation
- `69e9cde` — Retry migrate deploy once during build to survive Neon cold starts

## Standing practice going forward

After every `git push` to `main`, verify the resulting Vercel deployment
actually reaches **Ready** before considering the work done — don't assume a
push alone means production is updated:

```
vercel ls                                   # find the newest deployment + its status
vercel inspect <url> --logs                 # if Error, see why
```

A push can trigger a deploy that **fails** (as it did here) while the
previous, older deployment keeps serving traffic — so "pushed" is not the
same as "live."
