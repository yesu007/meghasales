-- AlterTable
-- Project Name was missing from the initial Project master (add_project_master
-- migration) despite being one of the requested form fields. Added NOT NULL
-- with no default: the projects table has no rows yet in any environment
-- this has shipped to, so there is nothing to backfill.
ALTER TABLE "projects" ADD COLUMN "project_name" TEXT NOT NULL;
