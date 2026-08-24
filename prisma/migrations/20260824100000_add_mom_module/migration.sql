-- CreateTable
CREATE TABLE "moms" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "summary" TEXT,
    "risks_issues" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mom_versions" (
    "id" SERIAL NOT NULL,
    "mom_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content_snapshot" JSONB NOT NULL,
    "edited_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mom_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mom_decisions" (
    "id" SERIAL NOT NULL,
    "mom_id" INTEGER NOT NULL,
    "decision_text" TEXT NOT NULL,
    "decided_by" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mom_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moms_meeting_id_key" ON "moms"("meeting_id");

-- CreateIndex
CREATE INDEX "moms_status_idx" ON "moms"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mom_versions_mom_id_version_number_key" ON "mom_versions"("mom_id", "version_number");

-- CreateIndex
CREATE INDEX "mom_decisions_mom_id_idx" ON "mom_decisions"("mom_id");

-- AddForeignKey
ALTER TABLE "moms" ADD CONSTRAINT "moms_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_versions" ADD CONSTRAINT "mom_versions_mom_id_fkey" FOREIGN KEY ("mom_id") REFERENCES "moms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_decisions" ADD CONSTRAINT "mom_decisions_mom_id_fkey" FOREIGN KEY ("mom_id") REFERENCES "moms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
