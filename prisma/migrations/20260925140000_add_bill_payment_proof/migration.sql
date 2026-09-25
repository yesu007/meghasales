-- Payment proof attached in the Bills Payment popup, kept separate from the
-- bill's invoice PDF attachment.
ALTER TABLE "bills" ADD COLUMN "payment_proof_url" TEXT;
ALTER TABLE "bills" ADD COLUMN "payment_proof_name" TEXT;
