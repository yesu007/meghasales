-- AlterTable
-- Project's own optional Lead reference (Project form's new "Lead" dropdown,
-- independent of the required Customer reference).
ALTER TABLE "projects" ADD COLUMN "lead_id" INTEGER;

-- CreateIndex
CREATE INDEX "projects_lead_id_idx" ON "projects"("lead_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
-- Lead/Customer's own "Project" field — replaces the free-text Project Name
-- input on the Lead and Customer forms with a picker into the Project
-- master. The old project_name TEXT column is left untouched (existing
-- historical values stay put); this is an independent, additive column.
ALTER TABLE "leads" ADD COLUMN "project_id" INTEGER;

-- CreateIndex
CREATE INDEX "leads_project_id_idx" ON "leads"("project_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
