/*
  Warnings:

  - You are about to drop the `Stock` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Approvals" DROP CONSTRAINT "Approvals_stockId_fkey";

-- DropForeignKey
ALTER TABLE "Stock" DROP CONSTRAINT "Stock_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Stock" DROP CONSTRAINT "Stock_itemId_fkey";

-- DropForeignKey
ALTER TABLE "Stock" DROP CONSTRAINT "Stock_supplierId_fkey";

-- DropTable
DROP TABLE "Stock";

-- CreateTable
CREATE TABLE "StockReceipts" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "purchaseOrderNo" TEXT,
    "invoiceNo" TEXT,
    "supplierId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "quantityReceived" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "packSize" DECIMAL(10,2),
    "uom" TEXT NOT NULL,
    "tempReq" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL,
    "specialHandlingNotes" TEXT,
    "remarksNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReceipts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approvals" ADD CONSTRAINT "Approvals_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "StockReceipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
