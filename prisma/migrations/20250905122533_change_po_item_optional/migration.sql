-- DropForeignKey
ALTER TABLE "DeliveryItem" DROP CONSTRAINT "DeliveryItem_purchaseOrderItemId_fkey";

-- AlterTable
ALTER TABLE "DeliveryItem" ALTER COLUMN "purchaseOrderItemId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
