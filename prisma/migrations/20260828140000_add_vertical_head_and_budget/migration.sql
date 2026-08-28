-- AlterTable
-- updated_at needs a default for this ALTER (unlike a fresh CreateTable) —
-- the verticals table already has rows (the six BRD verticals seeded in
-- 20260828120100), so a bare NOT NULL with no default would fail against
-- them. Existing rows backfill to "now" at migration time; every row
-- written after this point gets a real value via Prisma's @updatedAt.
ALTER TABLE "verticals" ADD COLUMN     "budget" DECIMAL(15,2),
ADD COLUMN     "budget_currency_code" TEXT DEFAULT 'INR',
ADD COLUMN     "head_id" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "verticals" ADD CONSTRAINT "verticals_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
