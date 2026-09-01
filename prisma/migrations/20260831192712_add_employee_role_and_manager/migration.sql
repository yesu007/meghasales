-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "manager_id" INTEGER,
ADD COLUMN     "role" TEXT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
