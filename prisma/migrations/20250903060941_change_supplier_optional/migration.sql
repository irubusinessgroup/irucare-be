-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_supplierId_fkey";

-- AlterTable
ALTER TABLE "StockReceipts" ALTER COLUMN "supplierId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
