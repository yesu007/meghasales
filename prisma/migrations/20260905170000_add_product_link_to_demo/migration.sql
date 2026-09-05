-- AlterTable
-- Demo module's own Project/Product picker (see the New Demo Project
-- form's own comment) — same shape/convention as demos.project_id
-- (20260904090000_add_project_link_to_demo_quotation_implementation).
ALTER TABLE "demos" ADD COLUMN "product_id" INTEGER;

-- CreateIndex
CREATE INDEX "demos_product_id_idx" ON "demos"("product_id");

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
