-- AlterTable
-- Product Master's own Status/Stage columns (see the Customer main
-- table's CustomerProductsPanel) — same shape/convention as
-- implementations.project_id
-- (20260904090000_add_project_link_to_demo_quotation_implementation).
ALTER TABLE "implementations" ADD COLUMN "product_id" INTEGER;

-- CreateIndex
CREATE INDEX "implementations_product_id_idx" ON "implementations"("product_id");

-- AddForeignKey
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
