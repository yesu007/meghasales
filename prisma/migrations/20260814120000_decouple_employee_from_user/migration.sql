-- Decouple Employee from requiring a User account — most staff never
-- need CRM login access, but still need a payroll record. user_id
-- becomes optional; name/email now live directly on Employee. Every
-- existing employee currently has a user_id, so backfilling from the
-- linked User's own name/email before adding the NOT NULL constraints
-- is safe and loses no data.
ALTER TABLE "employees" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "employees" ADD COLUMN "first_name" TEXT;
ALTER TABLE "employees" ADD COLUMN "last_name" TEXT;
ALTER TABLE "employees" ADD COLUMN "email" TEXT;

UPDATE "employees" e
SET "first_name" = u."first_name", "last_name" = u."last_name", "email" = u."email"
FROM "users" u
WHERE e."user_id" = u."id";

ALTER TABLE "employees" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "last_name" SET NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "email" SET NOT NULL;
