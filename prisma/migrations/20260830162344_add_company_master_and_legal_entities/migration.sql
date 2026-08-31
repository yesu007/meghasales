-- AlterTable
ALTER TABLE "event_documents" ADD COLUMN     "legal_entity_id" INTEGER;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "legal_entity_id" INTEGER;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "company_id" INTEGER,
ADD COLUMN     "legal_entity_id" INTEGER;

-- AlterTable
ALTER TABLE "quotations" ADD COLUMN     "legal_entity_id" INTEGER;

-- CreateTable
CREATE TABLE "companies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_legal_entities" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "country_id" INTEGER NOT NULL,
    "legal_name" TEXT NOT NULL,
    "registration_number" TEXT,
    "tax_registration_number" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postal_code" TEXT,
    "currency_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_legal_entities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE INDEX "company_legal_entities_company_id_idx" ON "company_legal_entities"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "company_legal_entities_company_id_country_id_key" ON "company_legal_entities"("company_id", "country_id");

-- CreateIndex
CREATE INDEX "event_documents_legal_entity_id_idx" ON "event_documents"("legal_entity_id");

-- CreateIndex
CREATE INDEX "invoices_legal_entity_id_idx" ON "invoices"("legal_entity_id");

-- CreateIndex
CREATE INDEX "leads_company_id_idx" ON "leads"("company_id");

-- CreateIndex
CREATE INDEX "leads_legal_entity_id_idx" ON "leads"("legal_entity_id");

-- CreateIndex
CREATE INDEX "quotations_legal_entity_id_idx" ON "quotations"("legal_entity_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_legal_entities" ADD CONSTRAINT "company_legal_entities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_legal_entities" ADD CONSTRAINT "company_legal_entities_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "company_legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "company_legal_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "company_legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "company_legal_entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
