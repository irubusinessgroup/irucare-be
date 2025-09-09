-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_purchaseOrderId_fkey";

-- AlterTable
ALTER TABLE "StockReceipts" ADD COLUMN     "receiptType" TEXT NOT NULL DEFAULT 'PURCHASE_ORDER',
ALTER COLUMN "purchaseOrderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
