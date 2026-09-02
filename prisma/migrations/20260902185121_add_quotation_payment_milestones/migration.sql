-- CreateTable
CREATE TABLE "quotation_payment_milestones" (
    "id" SERIAL NOT NULL,
    "quotation_id" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "gap_days" INTEGER NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invoice_id" INTEGER,
    "rescheduled_at" TIMESTAMP(3),
    "reschedule_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotation_payment_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_payment_milestones_status_scheduled_date_idx" ON "quotation_payment_milestones"("status", "scheduled_date");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_payment_milestones_quotation_id_sequence_key" ON "quotation_payment_milestones"("quotation_id", "sequence");

-- AddForeignKey
ALTER TABLE "quotation_payment_milestones" ADD CONSTRAINT "quotation_payment_milestones_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_payment_milestones" ADD CONSTRAINT "quotation_payment_milestones_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
