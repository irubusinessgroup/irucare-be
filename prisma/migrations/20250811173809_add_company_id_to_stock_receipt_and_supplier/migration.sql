/*
  Warnings:

  - You are about to drop the `Supplier` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `company_id` to the `StockReceipts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `company_id` to the `Suppliers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "StockReceipts" ADD COLUMN     "company_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Suppliers" ADD COLUMN     "company_id" TEXT NOT NULL;

-- DropTable
DROP TABLE "Supplier";

-- AddForeignKey
ALTER TABLE "Suppliers" ADD CONSTRAINT "Suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
