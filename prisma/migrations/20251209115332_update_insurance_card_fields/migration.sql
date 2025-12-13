/*
  Warnings:

  - You are about to drop the column `beneficiary` on the `InsuranceCard` table. All the data in the column will be lost.
  - You are about to drop the column `cardNumber` on the `InsuranceCard` table. All the data in the column will be lost.
  - You are about to drop the column `expireDate` on the `InsuranceCard` table. All the data in the column will be lost.
  - You are about to drop the column `expired` on the `InsuranceCard` table. All the data in the column will be lost.
  - You are about to drop the column `isOwner` on the `InsuranceCard` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[affiliationNumber]` on the table `InsuranceCard` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `affiliateName` to the `InsuranceCard` table without a default value. This is not possible if the table is not empty.
  - Added the required column `affiliationNumber` to the `InsuranceCard` table without a default value. This is not possible if the table is not empty.
  - Added the required column `birthDate` to the `InsuranceCard` table without a default value. This is not possible if the table is not empty.
  - Added the required column `relationship` to the `InsuranceCard` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "InsuranceCard_cardNumber_key";

-- AlterTable
ALTER TABLE "InsuranceCard" DROP COLUMN "beneficiary",
DROP COLUMN "cardNumber",
DROP COLUMN "expireDate",
DROP COLUMN "expired",
DROP COLUMN "isOwner",
ADD COLUMN     "affiliateName" TEXT NOT NULL,
ADD COLUMN     "affiliationNumber" TEXT NOT NULL,
ADD COLUMN     "birthDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "policeNumber" TEXT DEFAULT '0',
ADD COLUMN     "relationship" TEXT NOT NULL,
ADD COLUMN     "workDepartment" TEXT,
ADD COLUMN     "workplace" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceCard_affiliationNumber_key" ON "InsuranceCard"("affiliationNumber");
