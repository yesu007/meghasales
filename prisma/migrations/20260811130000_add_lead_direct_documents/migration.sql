-- AlterTable
ALTER TABLE "event_documents" ADD COLUMN     "lead_id" INTEGER;

-- CreateIndex
CREATE INDEX "event_documents_lead_id_idx" ON "event_documents"("lead_id");

-- AddForeignKey
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
