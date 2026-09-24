-- LoanRepayment becomes period-scoped instead of run-scoped: a loan
-- installment can now be sent to Payroll before that month's PayrollRun
-- even exists. run_id/payslip_id are nullable until a matching payslip is
-- created and the repayment gets attached (see generateRunPayslips in
-- src/lib/payroll/runService.ts).

-- Add the new period columns as nullable first so existing rows don't
-- fail the insert, backfill them from each row's current run, then
-- tighten to NOT NULL.
ALTER TABLE "loan_repayments" ADD COLUMN "period_year" INTEGER;
ALTER TABLE "loan_repayments" ADD COLUMN "period_month" INTEGER;

UPDATE "loan_repayments" lr
SET "period_year" = pr.pay_period_year,
    "period_month" = pr.pay_period_month
FROM "payroll_runs" pr
WHERE lr.run_id = pr.id;

ALTER TABLE "loan_repayments" ALTER COLUMN "period_year" SET NOT NULL;
ALTER TABLE "loan_repayments" ALTER COLUMN "period_month" SET NOT NULL;

-- run_id is now optional — null means "sent, not yet attached to a run".
ALTER TABLE "loan_repayments" ALTER COLUMN "run_id" DROP NOT NULL;

-- Duplicate-prevention moves from (loan, run) to (loan, period) — stricter
-- and correct even before a run exists.
DROP INDEX "loan_repayments_loan_id_run_id_key";
CREATE UNIQUE INDEX "loan_repayments_loan_id_period_year_period_month_key" ON "loan_repayments"("loan_id", "period_year", "period_month");
