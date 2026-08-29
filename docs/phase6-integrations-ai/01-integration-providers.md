# Phase 6 integration providers: calendar sync & WhatsApp/SMS

Meeting Lifecycle Blueprint (§03, §13, §19) deliberately left two integration
decisions unmade — "a decision this document intentionally doesn't make on
the business's behalf." This doc lays out the concrete options for both,
each with API/auth/webhook detail, so a business decision can be made
without further research. No provider is installed or coded yet.

Today: `Meeting.eventDateTime`-equivalent (`Meeting.scheduledAt`) is a plain
field. MVP (Phases 1–5, shipped) only offers an `.ics` file download per
meeting — no live sync, no external messaging channel exists anywhere in the
codebase.

## A. Calendar sync

Two-way sync (create/update/cancel a `Meeting` ⇄ push to the organizer's and
participants' calendars, pull back RSVP/reschedule) vs. today's one-way
`.ics` download.

### Option 1 — Google Calendar API

- **Auth**: OAuth 2.0, `https://www.googleapis.com/auth/calendar.events`
  scope (per-user consent, not domain-wide unless the org is on Google
  Workspace with domain-wide delegation configured by a Workspace admin).
  Refresh tokens stored per-user — needs a new `GoogleCalendarCredential`
  table (`userId`, `accessToken`, `refreshToken`, `expiresAt`, `calendarId`).
- **Core endpoints**:
  - `POST /calendar/v3/calendars/{calendarId}/events` — create, with
    `attendees[]`, `reminders`, `conferenceData` (for a Meet link).
  - `PATCH /calendar/v3/calendars/{calendarId}/events/{eventId}` — reschedule
    (maps to the existing `PATCH /api/todo/[id]/reschedule` flow) or cancel.
  - `GET /calendar/v3/calendars/{calendarId}/events/{eventId}` — read back
    attendee `responseStatus` (`accepted`/`declined`/`tentative`/`needsAction`)
    to sync into `MeetingParticipant.rsvpStatus`.
  - Push notifications: `POST /calendar/v3/calendars/{calendarId}/events/watch`
    registers a webhook channel (expires after ≤30 days, must be renewed) that
    POSTs to our endpoint on any change — this is how external
    reschedule/RSVP changes flow back in, rather than polling.
- **Rate limits**: 1,000,000 queries/day per project by default (raisable),
  per-user limit ~500 req/100s — generous for this app's meeting volume.
  Free.
- **Data model impact**: `Meeting` gains `externalCalendarEventId`,
  `externalCalendarProvider`. `MeetingParticipant.rsvpStatus` becomes
  externally-writable (webhook-driven), not just internally.
- **Effort**: M–L. OAuth consent flow + token refresh + webhook
  channel-renewal cron are the bulk of the work; the event CRUD mapping
  itself is straightforward.

### Option 2 — Microsoft Graph API (Outlook/Microsoft 365)

- **Auth**: OAuth 2.0 via Azure AD app registration, `Calendars.ReadWrite`
  delegated scope (per-user) or `Calendars.ReadWrite` **application**
  permission (if the org is on Microsoft 365 and wants org-wide sync without
  per-user consent — needs tenant-admin approval once).
- **Core endpoints**:
  - `POST /v1.0/me/events` (delegated) or
    `POST /v1.0/users/{id}/events` (application) — create, with `attendees[]`,
    `onlineMeeting` (for a Teams link).
  - `PATCH /v1.0/me/events/{id}` — reschedule/cancel.
  - Change tracking: `POST /v1.0/subscriptions` (webhook, max 3 days for
    calendar resources, must be renewed) **or** delta queries
    (`GET /v1.0/me/events/delta`) for a polling fallback.
- **Rate limits**: per-app/per-tenant throttling (HTTP 429 with
  `Retry-After`), generally generous for this volume. Free with an M365/Azure
  AD tenant the business already has if they're on Microsoft; otherwise a
  separate Azure AD tenant is needed.
- **Data model impact**: same as Option 1 — `externalCalendarEventId` /
  `externalCalendarProvider` accommodate either provider on the same column
  pair.
- **Effort**: M–L, comparable to Google. Slightly more setup ceremony (Azure
  AD app registration + admin consent) if application permissions are used.

### Recommendation shape (not a decision)

If the business's email/calendar is Google Workspace → Option 1 only. If
Microsoft 365 → Option 2 only. If mixed or unknown → both, with
`externalCalendarProvider` as a per-user preference field, shipped
incrementally (one provider first). Either way this is genuinely new,
zero-to-one integration work (OAuth app registration with the provider,
credential storage, webhook renewal cron) — no shortcut through the
Marketplace exists for calendar sync specifically (unlike WhatsApp/SMS
below), since Google/Microsoft calendar isn't a Vercel Marketplace product.

## B. WhatsApp / SMS notifications

Today's notification channels are `IN_APP` and `EMAIL`
(`NotificationTemplate.channel`, `notifyManyViaTemplate` in
`src/lib/meetings/notificationTemplates.ts`). Adding `WHATSAPP`/`SMS` as a
third and fourth channel is additive to that same enum + dispatch function —
the new work is entirely the outbound-provider integration, per the
`marketplace` skill guidance (favor a real, provisioned Vercel Marketplace
integration over a hardcoded SDK).

### Option 1 — Twilio (Vercel Marketplace)

- **Install**: `vercel integration add twilio` (Marketplace-provisioned;
  confirm current listing via the `marketplace` skill's `discover` at
  install time — offerings change).
- **Auth**: Account SID + Auth Token (or an API Key/Secret pair), stored as
  Vercel env vars via the integration, not hand-entered secrets.
- **Core endpoints**:
  - `POST /2010-04-01/Accounts/{AccountSid}/Messages.json` — send, `Body`,
    `To` (E.164), `From` (a Twilio number or WhatsApp-enabled sender), or
    `ContentSid` for a pre-approved WhatsApp template (required for any
    business-initiated WhatsApp message outside a 24h user-reply window).
  - Delivery status webhook: `StatusCallback` URL on the send request,
    receives `queued`→`sent`→`delivered`/`failed` transitions — maps onto
    `ActionItemReminder.status`/`lastError` the same way email failures do
    today.
- **WhatsApp specifics**: requires a Meta-approved WhatsApp Business
  sender + pre-approved message templates (separate approval process from
  Twilio itself, submitted through Twilio's console). SMS has no such
  template requirement.
- **Pricing**: per-message, tiered by country + channel (WhatsApp
  conversation-based pricing is different from per-SMS pricing) — check
  current Twilio pricing page at decision time, not from memory.
- **Effort**: M. Mechanically it's a new `channel` case in
  `notifyManyViaTemplate` plus a `sendWhatsapp`/`sendSms` function alongside
  the existing `nodemailer` call — the real lead time is the WhatsApp
  template pre-approval (business-side, days-to-weeks), not the code.

### Option 2 — MessageBird / Sinch, 360dialog (Vercel Marketplace alternatives)

- Same shape as Twilio (REST send endpoint, delivery-status webhook,
  WhatsApp template pre-approval requirement) — listed as alternatives
  because Marketplace availability and per-country/per-channel pricing shift
  over time; re-run the `marketplace` skill's `discover` step to see what's
  actually installable today rather than assuming Twilio is the only option.
- 360dialog is WhatsApp-only (no generic SMS) and markets itself as a direct
  Meta Business Solution Provider — worth a look specifically if WhatsApp is
  the priority channel and SMS isn't needed at all.

### Recommendation shape (not a decision)

Whichever provider is chosen, model it as channel values `WHATSAPP`/`SMS` on
the existing `NotificationTemplate`/`ActionItemReminder` enums rather than a
parallel notification system — the materializer/dispatcher/template-token
infrastructure from Phase 4 is channel-agnostic already. The provider choice
mainly affects which env vars and which single `send*` function get added to
`notificationTemplates.ts`.
