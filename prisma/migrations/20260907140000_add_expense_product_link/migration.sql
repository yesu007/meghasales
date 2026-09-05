-- AlterTable
-- Product Expenses (see the Expenses module's own Overall/Project/Product
-- toggle) — same shape/convention as expenses.project_id
-- (20260901233710_add_expense_project_link).
ALTER TABLE "expenses" ADD COLUMN "product_id" INTEGER;

-- CreateIndex
CREATE INDEX "expenses_product_id_idx" ON "expenses"("product_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
