-- Daily Attendance is removed from Shift Master; Shift and
-- EmployeeShiftAssignment (timings/buffers/escalation rules + the
-- employee-to-shift mapping) stay.
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_employee_id_fkey";
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_shift_id_fkey";

DROP TABLE "attendance_records";
