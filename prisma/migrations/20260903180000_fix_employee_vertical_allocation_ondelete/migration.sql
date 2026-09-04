-- The prior migration (20260903170000_rework_salary_allocation_to_employee_vertical)
-- created this FK as ON DELETE RESTRICT, but schema.prisma declares
-- `vertical Vertical?` (nullable) with no explicit onDelete — Prisma's
-- default for a nullable relation is SET NULL. Aligning the live
-- constraint to match the schema (surfaced by `prisma migrate diff` after
-- merging in that migration) rather than leaving the two out of sync.
ALTER TABLE "employee_vertical_allocations" DROP CONSTRAINT "employee_vertical_allocations_vertical_id_fkey";

ALTER TABLE "employee_vertical_allocations" ADD CONSTRAINT "employee_vertical_allocations_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
