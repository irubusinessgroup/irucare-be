/*
  Warnings:

  - You are about to drop the column `accountHolderName` on the `CompanyTools` table. All the data in the column will be lost.
  - You are about to drop the column `accountNumber` on the `CompanyTools` table. All the data in the column will be lost.
  - You are about to drop the column `bankName` on the `CompanyTools` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CompanyTools" DROP COLUMN "accountHolderName",
DROP COLUMN "accountNumber",
DROP COLUMN "bankName",
ADD COLUMN     "bankAccounts" JSONB;
