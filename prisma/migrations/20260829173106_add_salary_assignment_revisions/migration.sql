-- CreateTable
CREATE TABLE "salary_assignment_revisions" (
    "id" SERIAL NOT NULL,
    "assignment_id" INTEGER NOT NULL,
    "previous_ctc" DECIMAL(14,2) NOT NULL,
    "new_ctc" DECIMAL(14,2) NOT NULL,
    "reason" TEXT,
    "revised_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_assignment_revisions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "salary_assignment_revisions" ADD CONSTRAINT "salary_assignment_revisions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "salary_structure_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
