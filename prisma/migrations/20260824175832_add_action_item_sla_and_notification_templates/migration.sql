-- CreateTable
CREATE TABLE "action_item_reminders" (
    "id" SERIAL NOT NULL,
    "action_item_id" INTEGER NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_item_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" SERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "action_item_reminders_scheduled_at_status_idx" ON "action_item_reminders"("scheduled_at", "status");

-- CreateIndex
CREATE INDEX "action_item_reminders_action_item_id_idx" ON "action_item_reminders"("action_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "action_item_reminders_action_item_id_offset_days_channel_re_key" ON "action_item_reminders"("action_item_id", "offset_days", "channel", "recipient_type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_event_type_channel_key" ON "notification_templates"("event_type", "channel");

-- AddForeignKey
ALTER TABLE "action_item_reminders" ADD CONSTRAINT "action_item_reminders_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
