-- CreateTable
CREATE TABLE "customer_kyc" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "legal_company_name" TEXT,
    "registration_tax_id" TEXT,
    "billing_address" TEXT,
    "authorized_contact" TEXT,
    "verification_status" TEXT NOT NULL DEFAULT 'PENDING',
    "verified_by_id" INTEGER,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_kyc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_kyc_documents" (
    "id" SERIAL NOT NULL,
    "kyc_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT,
    "mime_type" TEXT,
    "file_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_by_id" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_contracts" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "contract_type" TEXT NOT NULL,
    "project_name" TEXT,
    "implementation_id" INTEGER,
    "contract_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "file_name" TEXT,
    "file_type" TEXT,
    "mime_type" TEXT,
    "file_url" TEXT,
    "file_size" INTEGER,
    "uploaded_by_id" INTEGER,
    "uploaded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_kyc_lead_id_key" ON "customer_kyc"("lead_id");

-- CreateIndex
CREATE INDEX "customer_kyc_documents_kyc_id_idx" ON "customer_kyc_documents"("kyc_id");

-- CreateIndex
CREATE INDEX "customer_contracts_lead_id_idx" ON "customer_contracts"("lead_id");

-- AddForeignKey
ALTER TABLE "customer_kyc" ADD CONSTRAINT "customer_kyc_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_kyc" ADD CONSTRAINT "customer_kyc_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_kyc_documents" ADD CONSTRAINT "customer_kyc_documents_kyc_id_fkey" FOREIGN KEY ("kyc_id") REFERENCES "customer_kyc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_kyc_documents" ADD CONSTRAINT "customer_kyc_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contracts" ADD CONSTRAINT "customer_contracts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contracts" ADD CONSTRAINT "customer_contracts_implementation_id_fkey" FOREIGN KEY ("implementation_id") REFERENCES "implementations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_contracts" ADD CONSTRAINT "customer_contracts_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
