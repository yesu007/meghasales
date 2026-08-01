-- CreateTable
CREATE TABLE "admin_ticket_categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "default_priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "default_sla_days" INTEGER,
    "escalation_role_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_ticket_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_tickets" (
    "id" SERIAL NOT NULL,
    "ticket_no" TEXT NOT NULL,
    "category_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigned_to" INTEGER,
    "created_by" INTEGER,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "completed_by" INTEGER,
    "recurrence_id" INTEGER,
    "parent_ticket_id" INTEGER,
    "ref_type" TEXT,
    "ref_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_ticket_recurrences" (
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

    CONSTRAINT "admin_ticket_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_ticket_reminders" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "recipient_ref" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_ticket_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_ticket_activities" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "field_name" TEXT,
    "old_value" TEXT,
    "new_value" TEXT,
    "performed_by" INTEGER,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" TEXT,

    CONSTRAINT "admin_ticket_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_ticket_attachments" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" INTEGER,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_ticket_categories_code_key" ON "admin_ticket_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "admin_tickets_ticket_no_key" ON "admin_tickets"("ticket_no");

-- CreateIndex
CREATE INDEX "admin_tickets_status_due_date_idx" ON "admin_tickets"("status", "due_date");

-- CreateIndex
CREATE INDEX "admin_tickets_category_id_idx" ON "admin_tickets"("category_id");

-- CreateIndex
CREATE INDEX "admin_tickets_assigned_to_idx" ON "admin_tickets"("assigned_to");

-- CreateIndex
CREATE INDEX "admin_tickets_recurrence_id_idx" ON "admin_tickets"("recurrence_id");

-- CreateIndex
CREATE INDEX "admin_tickets_ref_type_ref_id_idx" ON "admin_tickets"("ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_tickets_recurrence_id_due_date_key" ON "admin_tickets"("recurrence_id", "due_date");

-- CreateIndex
CREATE INDEX "admin_ticket_recurrences_is_active_next_run_date_idx" ON "admin_ticket_recurrences"("is_active", "next_run_date");

-- CreateIndex
CREATE INDEX "admin_ticket_reminders_scheduled_at_status_idx" ON "admin_ticket_reminders"("scheduled_at", "status");

-- CreateIndex
CREATE INDEX "admin_ticket_reminders_ticket_id_idx" ON "admin_ticket_reminders"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_ticket_reminders_ticket_id_offset_days_channel_recipi_key" ON "admin_ticket_reminders"("ticket_id", "offset_days", "channel", "recipient_type");

-- CreateIndex
CREATE INDEX "admin_ticket_activities_ticket_id_idx" ON "admin_ticket_activities"("ticket_id");

-- CreateIndex
CREATE INDEX "admin_ticket_activities_performed_at_idx" ON "admin_ticket_activities"("performed_at");

-- CreateIndex
CREATE INDEX "admin_ticket_attachments_ticket_id_idx" ON "admin_ticket_attachments"("ticket_id");

-- AddForeignKey
ALTER TABLE "admin_tickets" ADD CONSTRAINT "admin_tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "admin_ticket_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tickets" ADD CONSTRAINT "admin_tickets_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "admin_ticket_recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tickets" ADD CONSTRAINT "admin_tickets_parent_ticket_id_fkey" FOREIGN KEY ("parent_ticket_id") REFERENCES "admin_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_ticket_reminders" ADD CONSTRAINT "admin_ticket_reminders_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "admin_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_ticket_activities" ADD CONSTRAINT "admin_ticket_activities_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "admin_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_ticket_attachments" ADD CONSTRAINT "admin_ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "admin_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
