-- AlterTable
ALTER TABLE "leads" ADD COLUMN "confirmed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "leads_confirmed_at_idx" ON "leads"("confirmed_at");

-- Backfill: for every already-converted (CONFIRMED) lead, set confirmed_at
-- to the timestamp of its LEAD_CONFIRMED activity (the moment the pipeline
-- transition actually happened) if one was logged, otherwise fall back to
-- the lead's own created_at (matches current/pre-existing display behavior
-- for rows with no such activity, e.g. customers created directly via
-- POST /api/customers, which are born CONFIRMED).
UPDATE "leads" l
SET "confirmed_at" = COALESCE(
  (SELECT MIN(la."created_at") FROM "lead_activities" la WHERE la."lead_id" = l."id" AND la."activity_type" = 'LEAD_CONFIRMED'),
  l."created_at"
)
WHERE l."status" = 'CONFIRMED';
