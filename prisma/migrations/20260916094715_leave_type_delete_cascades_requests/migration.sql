-- Deleting a LeaveType (Time-off Policy > Delete) now cascades: every
-- LeaveRequest that used it is permanently deleted along with it, instead
-- of the delete being blocked. At the requester's explicit direction —
-- deactivating a type (isActive) remains the non-destructive alternative.
ALTER TABLE "leave_requests" DROP CONSTRAINT "leave_requests_leave_type_id_fkey";
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
