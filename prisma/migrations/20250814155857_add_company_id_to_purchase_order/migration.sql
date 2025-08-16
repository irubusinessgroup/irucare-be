/*
  Warnings:

  - Added the required column `companyId` to the `PurchaseOrder` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "companyId" TEXT NOT NULL;
