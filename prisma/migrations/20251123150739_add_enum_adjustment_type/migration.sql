/*
  Warnings:

  - Changed the type of `adjustmentType` on the `PharmacyAdjustments` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('ADD', 'SUBTRACT', 'CORRECTION');

-- AlterTable
ALTER TABLE "PharmacyAdjustments" DROP COLUMN "adjustmentType",
ADD COLUMN     "adjustmentType" "AdjustmentType" NOT NULL;
