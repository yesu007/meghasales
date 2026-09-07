-- AlterTable
-- This Lead/Customer's own "Product" picker field — same shape as the
-- existing leads.project_id link (20260903090000_add_project_lead_link),
-- independent of products.customer_id/lead_id (ownership relations).
-- Added for the Customer creation form's "Product / Project" field.
ALTER TABLE "leads" ADD COLUMN "product_id" INTEGER;

-- CreateIndex
CREATE INDEX "leads_product_id_idx" ON "leads"("product_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
