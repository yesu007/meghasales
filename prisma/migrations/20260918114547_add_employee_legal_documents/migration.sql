-- Legal Documents — shared table for both HR-uploaded (Employee Details >
-- Legal Documents) and self-uploaded (My Space > My Documents) legal
-- documents, keyed by employee_id so the same record surfaces in both
-- places. uploaded_by is a loose reference (no FK), matching
-- admin_ticket_attachments.uploaded_by.
CREATE TABLE "employee_legal_documents" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" INTEGER,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_legal_documents_employee_id_idx" ON "employee_legal_documents"("employee_id");

ALTER TABLE "employee_legal_documents" ADD CONSTRAINT "employee_legal_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
