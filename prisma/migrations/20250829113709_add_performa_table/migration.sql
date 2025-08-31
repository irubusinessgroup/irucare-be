/*
  Warnings:

  - You are about to drop the column `batchNo` on the `PurchaseOrderProcessing` table. All the data in the column will be lost.
  - You are about to drop the column `expiryDate` on the `PurchaseOrderProcessing` table. All the data in the column will be lost.
  - You are about to drop the column `purchaseOrderItemId` on the `PurchaseOrderProcessing` table. All the data in the column will be lost.
  - You are about to drop the column `quantityIssued` on the `PurchaseOrderProcessing` table. All the data in the column will be lost.
  - You are about to drop the column `totalPrice` on the `PurchaseOrderProcessing` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `PurchaseOrderProcessing` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PurchaseOrderProcessing" DROP CONSTRAINT "PurchaseOrderProcessing_purchaseOrderItemId_fkey";

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "batchNo" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "quantityIssued" DECIMAL(10,2),
ADD COLUMN     "totalPrice" DECIMAL(18,2),
ADD COLUMN     "unitPrice" DECIMAL(18,4);

-- AlterTable
ALTER TABLE "PurchaseOrderProcessing" DROP COLUMN "batchNo",
DROP COLUMN "expiryDate",
DROP COLUMN "purchaseOrderItemId",
DROP COLUMN "quantityIssued",
DROP COLUMN "totalPrice",
DROP COLUMN "unitPrice";
