-- AlterTable
ALTER TABLE "expense_claims" ADD COLUMN "product_id" INTEGER;

-- CreateIndex
CREATE INDEX "expense_claims_product_id_idx" ON "expense_claims"("product_id");

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
