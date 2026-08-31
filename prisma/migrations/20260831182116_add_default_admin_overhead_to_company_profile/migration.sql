-- AlterTable
ALTER TABLE "company_profile" ADD COLUMN     "default_admin_overhead_mode" TEXT NOT NULL DEFAULT 'PCT',
ADD COLUMN     "default_admin_overhead_value" DECIMAL(10,2) NOT NULL DEFAULT 10;
