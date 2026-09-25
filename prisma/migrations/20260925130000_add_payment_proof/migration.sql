-- Payment proof attached when marking an Expense / Reimbursement as paid
-- (the Mark Paid popup), kept separate from each record's own attachment.
ALTER TABLE "expenses" ADD COLUMN "payment_proof_url" TEXT;
ALTER TABLE "expenses" ADD COLUMN "payment_proof_name" TEXT;
ALTER TABLE "expense_claims" ADD COLUMN "payment_proof_url" TEXT;
ALTER TABLE "expense_claims" ADD COLUMN "payment_proof_name" TEXT;
