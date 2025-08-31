/*
  Warnings:

  - You are about to drop the column `costPrice` on the `PurchaseOrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `quantityOrdered` on the `PurchaseOrderProcessing` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PurchaseOrderItem" DROP COLUMN "costPrice",
ADD COLUMN     "packSize" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "PurchaseOrderProcessing" DROP COLUMN "quantityOrdered";
