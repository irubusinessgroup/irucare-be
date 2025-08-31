-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "sellId" TEXT;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_sellId_fkey" FOREIGN KEY ("sellId") REFERENCES "Sell"("id") ON DELETE SET NULL ON UPDATE CASCADE;
