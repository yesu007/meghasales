-- CreateTable
CREATE TABLE "deadline_reminder_logs" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadline_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_config" (
    "id" SERIAL NOT NULL,
    "smtp_host" TEXT NOT NULL DEFAULT 'smtp.zoho.com',
    "smtp_port" INTEGER NOT NULL DEFAULT 465,
    "smtp_secure" BOOLEAN NOT NULL DEFAULT true,
    "smtp_user" TEXT,
    "smtp_password" TEXT,
    "from_email" TEXT,
    "from_name" TEXT DEFAULT 'MeghaSales',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" INTEGER,

    CONSTRAINT "email_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deadline_reminder_logs_entity_type_entity_id_stage_key" ON "deadline_reminder_logs"("entity_type", "entity_id", "stage");
