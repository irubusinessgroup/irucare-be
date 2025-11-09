/*
  Warnings:

  - You are about to drop the column `vat` on the `DirectInvoice` table. All the data in the column will be lost.
  - You are about to drop the column `vatRate` on the `DirectInvoice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DirectInvoice" DROP COLUMN "vat",
DROP COLUMN "vatRate";

-- AlterTable
ALTER TABLE "DirectInvoiceItem" ADD COLUMN     "isTaxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "taxAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0;
