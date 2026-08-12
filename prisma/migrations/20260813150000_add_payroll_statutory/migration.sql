-- AlterTable
ALTER TABLE "company_profile" ADD COLUMN     "esi_employer_rate" DECIMAL(5,2) DEFAULT 3.25,
ADD COLUMN     "esi_gross_threshold" DECIMAL(12,2) DEFAULT 21000,
ADD COLUMN     "pf_employer_rate" DECIMAL(5,2) DEFAULT 12,
ADD COLUMN     "pf_wage_ceiling" DECIMAL(12,2) DEFAULT 15000;

-- AlterTable
ALTER TABLE "salary_components" ADD COLUMN     "statutory_type" TEXT;

-- CreateTable
CREATE TABLE "pt_slabs" (
    "id" SERIAL NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'TN',
    "min_gross" DECIMAL(12,2) NOT NULL,
    "max_gross" DECIMAL(12,2),
    "monthly_amount" DECIMAL(12,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pt_slabs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pt_slabs_state_is_active_idx" ON "pt_slabs"("state", "is_active");
