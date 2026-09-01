-- AlterTable
-- Demo's own Project dropdown, scoped to the selected Lead/Customer — see
-- GET /api/projects's leadId filter. No prior Project field existed on Demo.
ALTER TABLE "demos" ADD COLUMN "project_id" INTEGER;

-- CreateIndex
CREATE INDEX "demos_project_id_idx" ON "demos"("project_id");

-- AddForeignKey
ALTER TABLE "demos" ADD CONSTRAINT "demos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- Quotation's own Project dropdown, same scoping. The existing project_name
-- TEXT column is left untouched (kept in sync from the selected project for
-- display/PDF purposes) — this is an independent, additive column.
ALTER TABLE "quotations" ADD COLUMN "project_id" INTEGER;

-- CreateIndex
CREATE INDEX "quotations_project_id_idx" ON "quotations"("project_id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- Implementation's own Project dropdown, same scoping. The existing
-- project_name TEXT column is left untouched, same rationale as Quotation.
ALTER TABLE "implementations" ADD COLUMN "project_id" INTEGER;

-- CreateIndex
CREATE INDEX "implementations_project_id_idx" ON "implementations"("project_id");

-- AddForeignKey
ALTER TABLE "implementations" ADD CONSTRAINT "implementations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
