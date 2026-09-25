-- AlterTable
ALTER TABLE "expense_claims" ADD COLUMN "sub_category_id" INTEGER;

-- CreateIndex
CREATE INDEX "expense_claims_sub_category_id_idx" ON "expense_claims"("sub_category_id");

-- AddForeignKey
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "expense_sub_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
