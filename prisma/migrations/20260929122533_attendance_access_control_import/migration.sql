-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "access_control_id" TEXT;

-- CreateTable
CREATE TABLE "attendance_import_files" (
    "id" SERIAL NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SFTP',
    "device_id" TEXT,
    "file_size" INTEGER,
    "remote_modified_at" TIMESTAMP(3),
    "raw_file_url" TEXT,
    "excel_file_url" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_started_at" TIMESTAMP(3),
    "processing_completed_at" TIMESTAMP(3),
    "total_records" INTEGER NOT NULL DEFAULT 0,
    "successful_records" INTEGER NOT NULL DEFAULT 0,
    "duplicate_records" INTEGER NOT NULL DEFAULT 0,
    "invalid_records" INTEGER NOT NULL DEFAULT 0,
    "unmatched_records" INTEGER NOT NULL DEFAULT 0,
    "unmatched_employees" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "details" JSONB,
    "created_by" INTEGER,

    CONSTRAINT "attendance_import_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER,
    "access_control_id" TEXT NOT NULL,
    "punch_at" TIMESTAMP(3) NOT NULL,
    "punch_type" TEXT NOT NULL,
    "verify_mode" INTEGER,
    "device_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SFTP',
    "source_file" TEXT NOT NULL,
    "import_file_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_attendance_summaries" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "attendance_date" DATE NOT NULL,
    "login_time" TIMESTAMP(3),
    "logout_time" TIMESTAMP(3),
    "total_working_minutes" INTEGER NOT NULL DEFAULT 0,
    "session_count" INTEGER NOT NULL DEFAULT 0,
    "punch_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_attendance_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_import_files_file_hash_key" ON "attendance_import_files"("file_hash");

-- CreateIndex
CREATE INDEX "attendance_import_files_uploaded_at_idx" ON "attendance_import_files"("uploaded_at");

-- CreateIndex
CREATE INDEX "attendance_punches_employee_id_punch_at_idx" ON "attendance_punches"("employee_id", "punch_at");

-- CreateIndex
CREATE INDEX "attendance_punches_access_control_id_idx" ON "attendance_punches"("access_control_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_device_id_access_control_id_punch_at_key" ON "attendance_punches"("device_id", "access_control_id", "punch_at");

-- CreateIndex
CREATE INDEX "daily_attendance_summaries_attendance_date_idx" ON "daily_attendance_summaries"("attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_attendance_summaries_employee_id_attendance_date_key" ON "daily_attendance_summaries"("employee_id", "attendance_date");

-- CreateIndex
CREATE UNIQUE INDEX "employees_access_control_id_key" ON "employees"("access_control_id");

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "attendance_import_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_attendance_summaries" ADD CONSTRAINT "daily_attendance_summaries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
