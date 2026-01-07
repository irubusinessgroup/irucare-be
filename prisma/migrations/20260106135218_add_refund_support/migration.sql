-- CreateEnum
CREATE TYPE "SellType" AS ENUM ('SALE', 'REFUND');

-- AlterTable
ALTER TABLE "Sell" ADD COLUMN     "parentSellId" TEXT,
ADD COLUMN     "refundReasonCode" TEXT,
ADD COLUMN     "refundReasonNote" TEXT,
ADD COLUMN     "type" "SellType" NOT NULL DEFAULT 'SALE';

-- AddForeignKey
ALTER TABLE "Sell" ADD CONSTRAINT "Sell_parentSellId_fkey" FOREIGN KEY ("parentSellId") REFERENCES "Sell"("id") ON DELETE SET NULL ON UPDATE CASCADE;