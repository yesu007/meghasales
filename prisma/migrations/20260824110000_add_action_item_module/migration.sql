-- CreateTable
CREATE TABLE "action_items" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "mom_id" INTEGER,
    "ref_type" TEXT,
    "ref_id" INTEGER,
    "description" TEXT NOT NULL,
    "assigned_to" INTEGER,
    "assigned_team" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "percent_complete" INTEGER NOT NULL DEFAULT 0,
    "depends_on_action_item_id" INTEGER,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3) NOT NULL,
    "escalation_level" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "completed_by" INTEGER,
    "verified_by" INTEGER,
    "verified_at" TIMESTAMP(3),
    "closure_remarks" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item_history" (
    "id" SERIAL NOT NULL,
    "action_item_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "field_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "performed_by" INTEGER,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "action_item_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item_comments" (
    "id" SERIAL NOT NULL,
    "action_item_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_item_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item_followups" (
    "id" SERIAL NOT NULL,
    "action_item_id" INTEGER NOT NULL,
    "follow_up_date" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "next_follow_up_date" TIMESTAMP(3),
    "owner_id" INTEGER,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_item_followups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_items_status_due_date_idx" ON "action_items"("status", "due_date");

-- CreateIndex
CREATE INDEX "action_items_assigned_to_idx" ON "action_items"("assigned_to");

-- CreateIndex
CREATE INDEX "action_items_meeting_id_idx" ON "action_items"("meeting_id");

-- CreateIndex
CREATE INDEX "action_items_mom_id_idx" ON "action_items"("mom_id");

-- CreateIndex
CREATE INDEX "action_items_ref_type_ref_id_idx" ON "action_items"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "action_items_depends_on_action_item_id_idx" ON "action_items"("depends_on_action_item_id");

-- CreateIndex
CREATE INDEX "action_item_history_action_item_id_idx" ON "action_item_history"("action_item_id");

-- CreateIndex
CREATE INDEX "action_item_history_performed_at_idx" ON "action_item_history"("performed_at");

-- CreateIndex
CREATE INDEX "action_item_comments_action_item_id_idx" ON "action_item_comments"("action_item_id");

-- CreateIndex
CREATE INDEX "action_item_followups_action_item_id_idx" ON "action_item_followups"("action_item_id");

-- CreateIndex
CREATE INDEX "action_item_followups_next_follow_up_date_idx" ON "action_item_followups"("next_follow_up_date");

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_mom_id_fkey" FOREIGN KEY ("mom_id") REFERENCES "moms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_depends_on_action_item_id_fkey" FOREIGN KEY ("depends_on_action_item_id") REFERENCES "action_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_history" ADD CONSTRAINT "action_item_history_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_comments" ADD CONSTRAINT "action_item_comments_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item_followups" ADD CONSTRAINT "action_item_followups_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
