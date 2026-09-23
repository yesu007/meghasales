-- Nested folder tree for My Documents / Employee -> Legal Documents.
ALTER TABLE "employee_legal_documents" ADD COLUMN     "folder_id" INTEGER;

CREATE TABLE "employee_document_folders" (
    "id" SERIAL NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "parent_id" INTEGER,
    "name" TEXT NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_document_folders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_document_folders_employee_id_idx" ON "employee_document_folders"("employee_id");
CREATE INDEX "employee_document_folders_parent_id_idx" ON "employee_document_folders"("parent_id");
CREATE UNIQUE INDEX "employee_document_folders_employee_id_parent_id_name_key" ON "employee_document_folders"("employee_id", "parent_id", "name");
CREATE INDEX "employee_legal_documents_folder_id_idx" ON "employee_legal_documents"("folder_id");

ALTER TABLE "employee_legal_documents" ADD CONSTRAINT "employee_legal_documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "employee_document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_document_folders" ADD CONSTRAINT "employee_document_folders_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_document_folders" ADD CONSTRAINT "employee_document_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "employee_document_folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
