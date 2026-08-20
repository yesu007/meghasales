-- Moves User<->Role from a single scalar FK (users.role_id) to an explicit
-- many-to-many join table, so a user can hold more than one role. Ordered so
-- every existing user's current role is preserved in user_roles BEFORE
-- role_id is dropped — never drop-then-backfill.

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" INTEGER,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every existing user's single role_id becomes their first
-- user_roles row.
INSERT INTO "user_roles" ("user_id", "role_id", "assigned_at")
SELECT "id", "role_id", CURRENT_TIMESTAMP FROM "users";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_role_id_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role_id";
