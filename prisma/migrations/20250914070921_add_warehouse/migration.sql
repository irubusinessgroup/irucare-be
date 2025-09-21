/*
  Warnings:

  - You are about to drop the column `storageLocation` on the `StockReceipts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "StockReceipts" DROP COLUMN "storageLocation",
ADD COLUMN     "warehouseId" TEXT;

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "warehousename" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
