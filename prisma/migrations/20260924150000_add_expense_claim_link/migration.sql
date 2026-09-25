-- Reimbursement -> Expense integration: an approved expense claim
-- auto-creates one REIMBURSEMENT expense (source column already exists).
-- The UNIQUE expense_claim_id traces it back to its claim and guarantees
-- one expense per claim however often the approval is triggered.
ALTER TABLE "expenses" ADD COLUMN "expense_claim_id" INTEGER;
CREATE UNIQUE INDEX "expenses_expense_claim_id_key" ON "expenses"("expense_claim_id");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expense_claim_id_fkey" FOREIGN KEY ("expense_claim_id") REFERENCES "expense_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;
