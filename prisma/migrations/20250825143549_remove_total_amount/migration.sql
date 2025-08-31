/*
  Warnings:

  - You are about to drop the column `totalAmount` on the `PurchaseOrder` table. All the data in the column will be lost.
  - You are about to drop the column `totalAmount` on the `PurchaseOrderItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PurchaseOrder" DROP COLUMN "totalAmount";

-- AlterTable
ALTER TABLE "PurchaseOrderItem" DROP COLUMN "totalAmount";
