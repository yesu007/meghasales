-- CreateTable
CREATE TABLE "manual_attendance_requests" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "attendance_date" DATE NOT NULL,
    "login_time" TEXT NOT NULL,
    "logout_time" TEXT NOT NULL,
    "work_location" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" INTEGER,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_attendance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_attendance_requests_employee_id_attendance_date_idx" ON "manual_attendance_requests"("employee_id", "attendance_date");

-- CreateIndex
CREATE INDEX "manual_attendance_requests_status_idx" ON "manual_attendance_requests"("status");

-- AddForeignKey
ALTER TABLE "manual_attendance_requests" ADD CONSTRAINT "manual_attendance_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Permission: approve_manual_attendance (Payroll → Time & Attendance),
-- placed right after approve_leave in the Roles screen and granted to every
-- role that can already approve leave (ADMIN included), so nobody who
-- approves time off today loses the ability to act on these.
UPDATE "permissions" SET "sort_order" = "sort_order" + 1
WHERE "sort_order" > (SELECT "sort_order" FROM "permissions" WHERE "name" = 'approve_leave');
INSERT INTO "permissions" ("name", "description", "module", "page", "action", "sort_order")
SELECT 'approve_manual_attendance', 'Approve or reject manual attendance requests', 'Payroll', 'Time & Attendance', 'other', "sort_order" + 1
FROM "permissions" WHERE "name" = 'approve_leave'
ON CONFLICT ("name") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", np."id" FROM "role_permissions" rp
JOIN "permissions" op ON op."id" = rp."permission_id" AND op."name" IN ('approve_leave')
CROSS JOIN "permissions" np WHERE np."name" = 'approve_manual_attendance'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'ADMIN' AND p."name" = 'approve_manual_attendance'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
