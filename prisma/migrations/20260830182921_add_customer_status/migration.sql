-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "customer_status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "verticals" ALTER COLUMN "updated_at" DROP DEFAULT;
