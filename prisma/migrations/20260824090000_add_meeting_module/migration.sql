-- CreateTable
CREATE TABLE "meetings" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "meeting_type" TEXT NOT NULL,
    "purpose" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER,
    "location" TEXT,
    "meeting_link" TEXT,
    "organizer_id" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "ref_type" TEXT,
    "ref_id" INTEGER,
    "recurrence_id" INTEGER,
    "parent_meeting_id" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_recurrences" (
    "id" SERIAL NOT NULL,
    "frequency" TEXT NOT NULL,
    "interval_value" INTEGER NOT NULL DEFAULT 1,
    "day_of_month" INTEGER,
    "day_of_week" INTEGER,
    "month_of_year" INTEGER,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "next_run_date" TIMESTAMP(3) NOT NULL,
    "last_generated_date" TIMESTAMP(3),
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_participants" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "participant_type" TEXT NOT NULL,
    "user_id" INTEGER,
    "external_name" TEXT,
    "external_email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ATTENDEE',
    "rsvp_status" TEXT NOT NULL DEFAULT 'PENDING',
    "attended" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_agenda_items" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "time_allocated_minutes" INTEGER,
    "owner_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_activities" (
    "id" SERIAL NOT NULL,
    "meeting_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "field_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "performed_by" INTEGER,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "meeting_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attachments" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" INTEGER,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meetings_status_scheduled_at_idx" ON "meetings"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "meetings_organizer_id_idx" ON "meetings"("organizer_id");

-- CreateIndex
CREATE INDEX "meetings_ref_type_ref_id_idx" ON "meetings"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "meetings_recurrence_id_idx" ON "meetings"("recurrence_id");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_recurrence_id_scheduled_at_key" ON "meetings"("recurrence_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "meeting_recurrences_is_active_next_run_date_idx" ON "meeting_recurrences"("is_active", "next_run_date");

-- CreateIndex
CREATE INDEX "meeting_participants_meeting_id_idx" ON "meeting_participants"("meeting_id");

-- CreateIndex
CREATE INDEX "meeting_participants_user_id_idx" ON "meeting_participants"("user_id");

-- CreateIndex
CREATE INDEX "meeting_agenda_items_meeting_id_idx" ON "meeting_agenda_items"("meeting_id");

-- CreateIndex
CREATE INDEX "meeting_activities_meeting_id_idx" ON "meeting_activities"("meeting_id");

-- CreateIndex
CREATE INDEX "meeting_activities_performed_at_idx" ON "meeting_activities"("performed_at");

-- CreateIndex
CREATE INDEX "meeting_attachments_entity_type_entity_id_idx" ON "meeting_attachments"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "meeting_recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_parent_meeting_id_fkey" FOREIGN KEY ("parent_meeting_id") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_agenda_items" ADD CONSTRAINT "meeting_agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_activities" ADD CONSTRAINT "meeting_activities_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
