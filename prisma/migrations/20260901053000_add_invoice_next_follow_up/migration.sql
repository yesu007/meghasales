-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "next_follow_up_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "invoices_next_follow_up_date_idx" ON "invoices"("next_follow_up_date");

