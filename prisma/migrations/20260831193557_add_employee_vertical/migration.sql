-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "vertical_id" INTEGER;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
