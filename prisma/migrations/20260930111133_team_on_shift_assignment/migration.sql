-- AlterTable
ALTER TABLE "employee_shift_assignments" ADD COLUMN     "week_off_team" TEXT;

-- AlterTable
ALTER TABLE "shifts" DROP COLUMN "week_off_team";
