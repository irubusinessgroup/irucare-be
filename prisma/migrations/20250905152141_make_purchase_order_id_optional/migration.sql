-- DropForeignKey
ALTER TABLE "Delivery" DROP CONSTRAINT "Delivery_purchaseOrderId_fkey";

-- AlterTable
ALTER TABLE "Delivery" ALTER COLUMN "purchaseOrderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
