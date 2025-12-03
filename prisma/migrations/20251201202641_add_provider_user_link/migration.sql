/*
  Warnings:

  - The values [DOCTOR] on the enum `ClinicRole` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `Provider` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ClinicRole_new" AS ENUM ('CLINIC_ADMIN', 'RECEPTIONIST', 'NURSE', 'PROVIDER', 'LAB_TECH', 'PHARMACIST', 'ACCOUNTANT');
ALTER TABLE "ClinicUserRole" ALTER COLUMN "role" TYPE "ClinicRole_new" USING ("role"::text::"ClinicRole_new");
ALTER TYPE "ClinicRole" RENAME TO "ClinicRole_old";
ALTER TYPE "ClinicRole_new" RENAME TO "ClinicRole";
DROP TYPE "ClinicRole_old";
COMMIT;

-- AlterTable
ALTER TABLE "Provider" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Provider_userId_key" ON "Provider"("userId");

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
