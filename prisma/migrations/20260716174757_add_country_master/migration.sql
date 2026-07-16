-- AlterTable
ALTER TABLE "company_profile" ADD COLUMN     "default_country_id" INTEGER;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "country_id" INTEGER,
ADD COLUMN     "currency_code" TEXT,
ADD COLUMN     "currency_symbol" TEXT,
ADD COLUMN     "tax_type" TEXT;

-- CreateTable
CREATE TABLE "countries" (
    "id" SERIAL NOT NULL,
    "country_name" TEXT NOT NULL,
    "iso_code" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "currency_name" TEXT NOT NULL,
    "currency_symbol" TEXT NOT NULL,
    "default_tax_type" TEXT NOT NULL,
    "default_tax_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "flag_emoji" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_iso_code_key" ON "countries"("iso_code");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_profile" ADD CONSTRAINT "company_profile_default_country_id_fkey" FOREIGN KEY ("default_country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
