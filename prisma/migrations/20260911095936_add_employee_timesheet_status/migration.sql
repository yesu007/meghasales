-- AlterTable
-- A standalone Active/Inactive flag for the Timesheet module's own "Status"
-- column (next to Type), deliberately separate from employees.status (the
-- employee's full HR/employment status: ACTIVE | ON_NOTICE | EXITED).
ALTER TABLE "employees" ADD COLUMN "timesheet_status" TEXT NOT NULL DEFAULT 'ACTIVE';
