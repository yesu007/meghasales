/*
  Warnings:

  - Added the required column `amount` to the `quotation_payment_milestones` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "quotation_payment_milestones" ADD COLUMN     "amount" DECIMAL(15,2) NOT NULL;
