-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_customer_id_fkey";

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "project_id" INTEGER;

-- CreateIndex
CREATE INDEX "expenses_project_id_idx" ON "expenses"("project_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
