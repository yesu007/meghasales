-- AlterTable
ALTER TABLE "company_profile" ADD COLUMN     "team_week_off_start_date" DATE;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "week_off_team" TEXT;

-- AlterTable
ALTER TABLE "shifts" ADD COLUMN     "week_off_team" TEXT;

-- CreateTable
CREATE TABLE "common_working_days" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "team" TEXT NOT NULL,
    "carry_forward_date" DATE NOT NULL,
    "note" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "common_working_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "common_working_days_date_key" ON "common_working_days"("date");

-- CreateIndex
CREATE UNIQUE INDEX "common_working_days_team_carry_forward_date_key" ON "common_working_days"("team", "carry_forward_date");
