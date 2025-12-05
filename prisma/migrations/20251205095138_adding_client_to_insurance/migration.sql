/*
  Warnings:

  - You are about to drop the column `percentage` on the `Insurance` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "InsuranceCard" DROP CONSTRAINT "InsuranceCard_patientId_fkey";

-- AlterTable
ALTER TABLE "Insurance" DROP COLUMN "percentage";

-- AlterTable
ALTER TABLE "InsuranceCard" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "percentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
ALTER COLUMN "patientId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "InsuranceCard" ADD CONSTRAINT "InsuranceCard_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceCard" ADD CONSTRAINT "InsuranceCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
