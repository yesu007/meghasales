-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_date_time" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "participants" TEXT,
    "location" TEXT,
    "meeting_link" TEXT,
    "description" TEXT,
    "next_action" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_documents" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER,
    "discussion_id" INTEGER,
    "file_name" TEXT NOT NULL,
    "description" TEXT,
    "mime_type" TEXT,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_document_versions" (
    "id" SERIAL NOT NULL,
    "event_document_id" INTEGER NOT NULL,
    "version_number" INTEGER NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" TEXT,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "uploaded_by" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_discussions" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "author_id" INTEGER,
    "notes" TEXT NOT NULL,
    "decisions_taken" TEXT,
    "action_items" TEXT,
    "assigned_to" INTEGER,
    "target_date" TIMESTAMP(3),
    "completion_status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_discussions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_lead_id_idx" ON "events"("lead_id");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_event_date_time_idx" ON "events"("event_date_time");

-- CreateIndex
CREATE INDEX "event_documents_event_id_idx" ON "event_documents"("event_id");

-- CreateIndex
CREATE INDEX "event_documents_discussion_id_idx" ON "event_documents"("discussion_id");

-- CreateIndex
CREATE INDEX "event_document_versions_event_document_id_idx" ON "event_document_versions"("event_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_document_versions_event_document_id_version_number_key" ON "event_document_versions"("event_document_id", "version_number");

-- CreateIndex
CREATE INDEX "event_discussions_event_id_idx" ON "event_discussions"("event_id");

-- CreateIndex
CREATE INDEX "event_discussions_created_at_idx" ON "event_discussions"("created_at");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_discussion_id_fkey" FOREIGN KEY ("discussion_id") REFERENCES "event_discussions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_document_versions" ADD CONSTRAINT "event_document_versions_event_document_id_fkey" FOREIGN KEY ("event_document_id") REFERENCES "event_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_document_versions" ADD CONSTRAINT "event_document_versions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_discussions" ADD CONSTRAINT "event_discussions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_discussions" ADD CONSTRAINT "event_discussions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_discussions" ADD CONSTRAINT "event_discussions_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
