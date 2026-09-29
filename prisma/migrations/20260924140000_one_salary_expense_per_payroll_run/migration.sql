-- Payroll Run -> Expense: one SALARY expense per payroll run (was one per
-- payslip). The employee-wise breakdown is now read from the run's
-- payslips, so the per-payslip link is dropped.

-- 1. Consolidate existing per-payslip SALARY expenses: keep the earliest
--    row of each run, set its amount to the run's (non-deleted) total, and
--    remove the other auto-generated rows so payroll_run_id can be unique.
WITH per_run AS (
  SELECT payroll_run_id,
         MIN(id) AS keep_id,
         SUM(amount) FILTER (WHERE deleted_at IS NULL) AS active_total,
         COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active_count
  FROM "expenses"
  WHERE source = 'SALARY' AND payroll_run_id IS NOT NULL
  GROUP BY payroll_run_id
)
UPDATE "expenses" e
SET amount = COALESCE(p.active_total, e.amount),
    deleted_at = CASE WHEN p.active_count > 0 THEN NULL ELSE e.deleted_at END,
    notes = 'Salary for ' || p.active_count || ' employee(s) — payroll run #' || p.payroll_run_id
FROM per_run p
WHERE e.id = p.keep_id;

DELETE FROM "expenses" e
USING (
  SELECT payroll_run_id, MIN(id) AS keep_id
  FROM "expenses"
  WHERE source = 'SALARY' AND payroll_run_id IS NOT NULL
  GROUP BY payroll_run_id
) k
WHERE e.source = 'SALARY' AND e.payroll_run_id = k.payroll_run_id AND e.id <> k.keep_id;

-- 2. Drop the per-payslip link, make the run link unique.
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_payslip_id_fkey";
DROP INDEX "expenses_payslip_id_key";
ALTER TABLE "expenses" DROP COLUMN "payslip_id";
DROP INDEX "expenses_payroll_run_id_idx";
CREATE UNIQUE INDEX "expenses_payroll_run_id_key" ON "expenses"("payroll_run_id");
