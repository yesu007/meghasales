-- AlterTable
ALTER TABLE "company_profile" ADD COLUMN     "esi_establishment_code" TEXT,
ADD COLUMN     "pf_establishment_code" TEXT,
ADD COLUMN     "pt_registration_number" TEXT,
ADD COLUMN     "tan_number" TEXT;

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "employee_code" TEXT NOT NULL,
    "department" TEXT,
    "designation" TEXT,
    "date_of_joining" TIMESTAMP(3),
    "date_of_leaving" TIMESTAMP(3),
    "employment_type" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "pan_number" TEXT,
    "uan_number" TEXT,
    "esic_number" TEXT,
    "bank_account_number" TEXT,
    "bank_ifsc" TEXT,
    "bank_account_holder" TEXT,
    "bank_name" TEXT,
    "tax_regime" TEXT NOT NULL DEFAULT 'NEW',
    "pf_applicable" BOOLEAN NOT NULL DEFAULT true,
    "esi_applicable" BOOLEAN NOT NULL DEFAULT false,
    "pt_applicable" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
