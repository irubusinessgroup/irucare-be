/*
  Warnings:

  - You are about to drop the `BillingPayment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ClinicBilling` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `InsuranceClaim` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BillingPayment" DROP CONSTRAINT "BillingPayment_billingId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicBilling" DROP CONSTRAINT "ClinicBilling_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ClinicBilling" DROP CONSTRAINT "ClinicBilling_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "ClinicBilling" DROP CONSTRAINT "ClinicBilling_patientId_fkey";

-- DropForeignKey
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT "InsuranceClaim_billingId_fkey";

-- DropForeignKey
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT "InsuranceClaim_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT "InsuranceClaim_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT "InsuranceClaim_insuranceCardId_fkey";

-- DropForeignKey
ALTER TABLE "InsuranceClaim" DROP CONSTRAINT "InsuranceClaim_patientId_fkey";

-- DropTable
DROP TABLE "BillingPayment";

-- DropTable
DROP TABLE "ClinicBilling";

-- DropTable
DROP TABLE "InsuranceClaim";

-- DropEnum
DROP TYPE "BillingStatus";
