-- AlterTable
ALTER TABLE "implementations" ADD COLUMN     "head_id" INTEGER,
ADD COLUMN     "vertical_id" INTEGER;

-- CreateIndex
CREATE INDEX "implementations_vertical_id_idx" ON "implementations"("vertical_id");

-- AddForeignKey
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "verticals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_head_id_fkey" FOREIGN KEY ("head_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
