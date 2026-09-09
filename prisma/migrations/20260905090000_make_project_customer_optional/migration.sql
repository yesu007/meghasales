-- AlterTable
-- Customer becomes optional now that a Project may instead be tied to a
-- Lead only (customerId/leadId are mutually exclusive — enforced in the API,
-- see POST/PATCH /api/projects). Existing rows already always have
-- customer_id set, so this is a pure constraint relaxation, no data change.
ALTER TABLE "projects" ALTER COLUMN "customer_id" DROP NOT NULL;
