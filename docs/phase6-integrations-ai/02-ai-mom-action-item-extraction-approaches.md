# Phase 6 AI features: implementation approaches

Scope per the Meeting Lifecycle Blueprint (§13 Phase 6, §19): AI-assisted
MOM drafting from raw notes/a transcript, and AI action-item extraction —
both **draft-only**, with a mandatory human-confirm gate ("no AI-suggested
item ever reaches `ASSIGNED` without a human click," §13's stated
acceptance test). This doc compares implementation approaches for both
features and how they plug into the existing AI stack, not a final choice.

## What already exists to build on

`src/lib/assistant/` is a working AI SDK v7 (`"ai": "^7.0.37"`) integration,
routed through the Vercel AI Gateway — this is the established convention,
not a new decision:

- Model is referenced as a plain gateway string, fetched from
  `https://ai-gateway.vercel.sh/v1/models` at build time rather than
  memorized (`src/lib/assistant/agent.ts`): `'anthropic/claude-sonnet-5'`.
- `createAssistantTool()` (`src/lib/assistant/registry.ts`) wraps `tool()` so
  every AI-invokable capability is permission-checked
  (`checkPermission(session, permission)`) before its handler runs, and a
  denial is *returned* as a typed result (`{error: 'permission_denied'}`)
  rather than thrown.
- `ToolLoopAgent` + `stepCountIs(6)` runs the existing voice-assistant's
  multi-step tool-calling loop.

Phase 6 AI work should reuse this stack (same model string source, same
`createAssistantTool` gate for any tool-calling), not introduce a second AI
integration path.

## Approach A — one-shot `generateObject` structured extraction

Feed raw meeting notes (typed) or a transcript (see "input capture" below)
into a single `generateObject` call against a Zod schema shaped like the
target rows:

```ts
const MomDraftSchema = z.object({
  summary: z.string(),
  risksIssues: z.string().optional(),
  decisions: z.array(z.object({ decisionText: z.string() })),
  actionItems: z.array(z.object({
    description: z.string(),
    suggestedAssigneeName: z.string().optional(), // free text; resolved to a userId by the human confirming, not by the model
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    suggestedDueDate: z.string().optional(), // ISO date string, relative phrases resolved by the model against "today"
  })),
});
```

- **Shape**: one request, one response, no intermediate turns. Maps
  directly onto `MomDecision`/`ActionItem` field names, so the "human
  confirms individually" UI can render the draft as a form pre-filled from
  the schema, exactly the shape of the existing MOM/action-item creation
  forms.
- **Where it plugs in**: a new `src/lib/meetings/aiExtractionService.ts`
  exposing `draftMomFromNotes(rawText): Promise<MomDraftSchema>` — no
  `ToolLoopAgent`, no tools, since there's nothing to look up mid-generation
  (the notes are the only input). Called from a new
  `POST /api/meetings/[id]/mom/ai-draft` route, gated on `manage_mom`
  (the same permission that gates writing a MOM by hand).
- **Human-confirm gate**: the response is never persisted directly. It's
  returned to the client as a suggestion; only an explicit "Accept" per
  decision/action-item (or "Accept all") calls the *existing*
  `momService.ts`/`actionItemService.ts` create functions — so AI-created
  rows are indistinguishable from human-created ones once accepted, and the
  existing status workflow (`ActionItem.status` starts at `DRAFT`, per the
  schema comment) already enforces that nothing reaches `ASSIGNED`
  automatically.
- **Complexity**: S–M. This is the natural default — it's the smallest
  addition that satisfies the blueprint's acceptance criterion, and reuses
  100% of the existing create/status-transition code paths.

## Approach B — agentic `ToolLoopAgent` extraction

Same goal, but modeled as a tool-calling agent (mirroring
`assistantAgent`) with read tools for meeting context (participants,
agenda items, prior action items on related meetings) so the model can
resolve "assign to whoever owns the vendor-integration item from last
time" style references instead of only working from raw text.

- **Where it plugs in**: new tools under `src/lib/assistant/tools/`
  (`readMeetingParticipants`, `readRelatedActionItems`, ...) registered via
  `createAssistantTool`, plus a second `ToolLoopAgent` instance (or the
  existing `assistantAgent` extended with these tools, if voice and
  MOM-drafting are meant to share one agent).
- **Trade-off vs. Approach A**: strictly more powerful (can resolve
  cross-references the raw text doesn't spell out) but non-deterministic
  step count, harder to test (`stopWhen: stepCountIs(N)` budget tuning),
  and the extra grounding tools are new attack surface for the
  hallucination risk the blueprint calls out (§13's risk row) — an agent
  that can *read* more data can also *misattribute* more confidently.
- **Complexity**: L. Justified only if a real product need emerges for
  cross-meeting reference resolution; not needed to satisfy the MVP-of-AI
  acceptance test.

## Approach C — `streamObject` for a live drafting UX

Same schema as Approach A, but streamed (`streamObject` instead of
`generateObject`) so the MOM-editor UI can show decisions/action items
populating incrementally instead of a blocking spinner.

- **Trade-off**: pure UX polish on top of Approach A — same backend
  service, same human-confirm gate, only the API route and client change
  (SSE/streaming response instead of a single JSON body). Cheap to adopt
  *after* Approach A ships, not a reason to delay it.

## Input capture: text notes vs. voice/transcript

MOM already supports voice-recording attachments (`MeetingAttachment`, added
after Phase 2). Two distinct input paths for the AI draft feature:

1. **Typed notes** — the organizer pastes/types raw notes into the AI-draft
   flow. No new integration; goes straight into Approach A/B/C above.
2. **Voice recording → transcript → draft** — requires a speech-to-text
   step before extraction. Options:
   - An AI Gateway audio-capable model, if/when the Gateway exposes one
     directly usable via the `ai` SDK — check
     `https://ai-gateway.vercel.sh/v1/models` at build time rather than
     assuming (per the existing `ASSISTANT_MODEL` comment's own convention).
   - A dedicated STT provider (e.g. Deepgram, AssemblyAI) via a Vercel
     Marketplace integration if the Gateway doesn't cover this well — same
     "provision through Marketplace, don't hardcode a provider SDK" rule
     that applies to WhatsApp/SMS (see `01-integration-providers.md`).
   - Recommendation shape: ship typed-notes drafting first (Approach A) —
     it satisfies the blueprint's acceptance test on its own — and treat
     voice-transcript-to-draft as a follow-on once a transcription provider
     is chosen.

## Recommendation shape (not a decision)

Start with **Approach A** (`generateObject`, no tools, reusing the existing
model-string convention) against typed notes only. It's the smallest
surface that satisfies §13's acceptance test, reuses the existing
MOM/action-item create paths and status workflow untouched, and leaves
Approaches B/C as additive upgrades once real usage shows they're needed —
consistent with the blueprint's general bias toward not building ahead of
an actual business ask (§19).
