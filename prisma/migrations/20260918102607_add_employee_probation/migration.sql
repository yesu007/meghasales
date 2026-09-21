-- Probation Period employee type: duration (months) + a calculated-but-
-- editable end date, same "computed default, plain editable column"
-- convention as Lead.nextFollowUpDate. Both are only meaningful when
-- employees.employment_type = 'PROBATION' (existing free-text pseudo-enum,
-- no DB-level check) and are left null for every other employment type.
ALTER TABLE "employees" ADD COLUMN "probation_duration_months" INTEGER;
ALTER TABLE "employees" ADD COLUMN "probation_end_date" TIMESTAMP(3);

-- Dedup log for the probation-notification cron — mirrors
-- deadline_reminder_logs, but scoped to Employee so a real FK applies.
-- probation_end_date is part of the uniqueness key (not just
-- employee_id+stage) so changing/extending an employee's Probation End
-- Date automatically makes the 6-day/1-day/end-date notifications
-- eligible again under a fresh key, with no separate "invalidate the old
-- schedule" step.
CREATE TABLE "probation_reminder_logs" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "probation_end_date" TIMESTAMP(3) NOT NULL,
    "stage" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "probation_reminder_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "probation_reminder_logs_employee_id_stage_probation_end_d_key" ON "probation_reminder_logs"("employee_id", "stage", "probation_end_date");

ALTER TABLE "probation_reminder_logs" ADD CONSTRAINT "probation_reminder_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
