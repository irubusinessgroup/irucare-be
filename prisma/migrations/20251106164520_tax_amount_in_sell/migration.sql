/*
  Warnings:

  - Added the required column `taxAmount` to the `SellItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Sell" ADD COLUMN     "taxAmount" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "SellItem" ADD COLUMN     "taxAmount" DECIMAL(18,2) NOT NULL;
