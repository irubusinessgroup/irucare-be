/*
  Warnings:

  - You are about to drop the column `costPrice` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `itemId` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `PurchaseOrder` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_itemId_fkey";

-- AlterTable
ALTER TABLE "PurchaseOrder" DROP COLUMN "costPrice",
DROP COLUMN "itemId",
DROP COLUMN "quantity",
DROP COLUMN "totalAmount";

-- AlterTable
ALTER TABLE "StockReceipts" ADD COLUMN     "purchaseOrderItemId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "costPrice" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
