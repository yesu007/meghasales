-- DropForeignKey
ALTER TABLE "salary_resources" DROP CONSTRAINT IF EXISTS "salary_resources_created_by_fkey";

-- DropForeignKey
ALTER TABLE "salary_allocation_splits" DROP CONSTRAINT IF EXISTS "salary_allocation_splits_resource_id_fkey";

-- DropForeignKey
ALTER TABLE "salary_allocation_splits" DROP CONSTRAINT IF EXISTS "salary_allocation_splits_category_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "salary_allocation_splits";

-- DropTable
DROP TABLE IF EXISTS "salary_resources";

-- DropTable
DROP TABLE IF EXISTS "allocation_categories";

-- CreateTable
CREATE TABLE "employee_vertical_allocations" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "vertical_id" INTEGER,
    "percentage" DECIMAL(5,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_vertical_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_vertical_allocations_vertical_id_idx" ON "employee_vertical_allocations"("vertical_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_vertical_allocations_employee_id_vertical_id_key" ON "employee_vertical_allocations"("employee_id", "vertical_id");

-- AddForeignKey
ALTER TABLE "employee_vertical_allocations" ADD CONSTRAINT "employee_vertical_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_vertical_allocations" ADD CONSTRAINT "employee_vertical_allocations_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
