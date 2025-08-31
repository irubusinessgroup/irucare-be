/*
  Warnings:

  - Made the column `website` on table `Company` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'SENT', 'RECEIVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "website" SET NOT NULL;

-- CreateTable
CREATE TABLE "PurchaseOrderProcessing" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "companyFromId" TEXT NOT NULL,
    "companyToId" TEXT NOT NULL,
    "quantityOrdered" DECIMAL(10,2) NOT NULL,
    "quantityIssued" DECIMAL(10,2),
    "batchNo" TEXT,
    "expiryDate" TIMESTAMP(3),
    "unitPrice" DECIMAL(18,4),
    "totalPrice" DECIMAL(18,2),
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderProcessing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseOrderProcessing" ADD CONSTRAINT "PurchaseOrderProcessing_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderProcessing" ADD CONSTRAINT "PurchaseOrderProcessing_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderProcessing" ADD CONSTRAINT "PurchaseOrderProcessing_companyFromId_fkey" FOREIGN KEY ("companyFromId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderProcessing" ADD CONSTRAINT "PurchaseOrderProcessing_companyToId_fkey" FOREIGN KEY ("companyToId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
