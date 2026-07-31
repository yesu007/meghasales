-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency_code" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchange_rate" DECIMAL(15,6) NOT NULL DEFAULT 1,
ADD COLUMN     "paid_amount" DECIMAL(15,2);

-- Backfill existing rows from their invoice's currency. Every payment
-- recorded before this migration was implicitly in the invoice's own
-- currency (no conversion existed), so exchange_rate stays 1 and
-- paid_amount mirrors amount.
UPDATE "payments" p
SET "currency_code" = i."currency_code",
    "paid_amount" = p."amount"
FROM "invoices" i
WHERE i."id" = p."invoice_id";

ALTER TABLE "payments" ALTER COLUMN "paid_amount" SET NOT NULL;
