-- AlterTable
-- Product Master's own "Budget Estimation" (see ProductBudgetPanel) —
-- same shape/convention as quotations.project_id
-- (20260904090000_add_project_link_to_demo_quotation_implementation).
ALTER TABLE "quotations" ADD COLUMN "product_id" INTEGER;

-- CreateIndex
CREATE INDEX "quotations_product_id_idx" ON "quotations"("product_id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
