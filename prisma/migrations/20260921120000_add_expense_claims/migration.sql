-- Employee expense reimbursement claims (My Space → Expense Claim) — a
-- separate table from expenses (Finance's own company-expense ledger),
-- reusing expense_categories as the "Expense Type" master.
CREATE TABLE "expense_claims" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "lead_id" INTEGER,
    "project_id" INTEGER,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "attachment_url" TEXT,
    "attachment_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "decided_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "paid_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_claims_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_claims_employee_id_idx" ON "expense_claims"("employee_id");
CREATE INDEX "expense_claims_status_idx" ON "expense_claims"("status");
CREATE INDEX "expense_claims_category_id_idx" ON "expense_claims"("category_id");
CREATE INDEX "expense_claims_lead_id_idx" ON "expense_claims"("lead_id");
CREATE INDEX "expense_claims_project_id_idx" ON "expense_claims"("project_id");

ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
