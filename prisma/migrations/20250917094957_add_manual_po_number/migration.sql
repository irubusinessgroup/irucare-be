-- AlterTable
ALTER TABLE "StockReceipts" ADD COLUMN     "manualPoNumber" TEXT;

-- CreateIndex
CREATE INDEX "StockReceipts_manualPoNumber_idx" ON "StockReceipts"("manualPoNumber");
