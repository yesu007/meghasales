-- AlterTable
-- Same "Next Follow-up" field/behavior as Lead.next_follow_up_date, now on
-- Demo — directly editable from the Demos list table, same convention.
ALTER TABLE "demos" ADD COLUMN "next_follow_up_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "demos_next_follow_up_date_idx" ON "demos"("next_follow_up_date");
