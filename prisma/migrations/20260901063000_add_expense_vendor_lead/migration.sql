-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "vendor_lead_id" INTEGER;

-- CreateIndex
CREATE INDEX "expenses_vendor_lead_id_idx" ON "expenses"("vendor_lead_id");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_lead_id_fkey" FOREIGN KEY ("vendor_lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

