-- AlterTable
ALTER TABLE "demos" ADD COLUMN     "head_id" INTEGER,
ADD COLUMN     "vertical_id" INTEGER;

-- CreateIndex
CREATE INDEX "demos_vertical_id_idx" ON "demos"("vertical_id");

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
