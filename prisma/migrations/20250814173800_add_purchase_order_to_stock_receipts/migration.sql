/*
  Warnings:

  - You are about to drop the column `purchaseOrderNo` on the `StockReceipts` table. All the data in the column will be lost.
  - Added the required column `purchaseOrderId` to the `StockReceipts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StockReceipts" DROP COLUMN "purchaseOrderNo",
ADD COLUMN     "purchaseOrderId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
