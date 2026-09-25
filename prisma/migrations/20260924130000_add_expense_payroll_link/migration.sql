-- Payroll Run -> Expense integration: an approved payroll run auto-creates
-- one SALARY expense per payslip. source distinguishes these from manually
-- recorded expenses (existing rows default to MANUAL); payroll_run_id /
-- payslip_id trace each one back to its run, and the UNIQUE payslip_id
-- guarantees one expense per payslip no matter how often the run is
-- re-approved or re-processed.
ALTER TABLE "expenses" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "payroll_run_id" INTEGER,
ADD COLUMN "payslip_id" INTEGER;

CREATE UNIQUE INDEX "expenses_payslip_id_key" ON "expenses"("payslip_id");
CREATE INDEX "expenses_source_idx" ON "expenses"("source");
CREATE INDEX "expenses_payroll_run_id_idx" ON "expenses"("payroll_run_id");

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
