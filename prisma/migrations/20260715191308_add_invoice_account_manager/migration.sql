-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "account_manager_id" INTEGER;

-- CreateIndex
CREATE INDEX "invoices_account_manager_id_idx" ON "invoices"("account_manager_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
