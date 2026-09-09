-- AlterTable
ALTER TABLE "leads" ADD COLUMN "finance_email" TEXT;

-- Backfill: existing customers (status=CONFIRMED) get their existing
-- `email` copied into `finance_email` so payment reminders (which switch
-- to using finance_email) keep working for them without interruption.
-- Editable afterward from the Customer edit form like any other field.
-- Leads that are not customers are left untouched (NULL) — the field is
-- only ever required/collected once a Lead becomes a Customer.
UPDATE "leads"
SET "finance_email" = "email"
WHERE "status" = 'CONFIRMED' AND "email" IS NOT NULL;
