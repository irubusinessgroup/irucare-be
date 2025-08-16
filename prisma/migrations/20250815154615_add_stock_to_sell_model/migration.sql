/*
  Warnings:

  - You are about to drop the column `sellPrice` on the `Stock` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Stock" DROP COLUMN "sellPrice",
ADD COLUMN     "sellId" TEXT;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_sellId_fkey" FOREIGN KEY ("sellId") REFERENCES "Sell"("id") ON DELETE SET NULL ON UPDATE CASCADE;
