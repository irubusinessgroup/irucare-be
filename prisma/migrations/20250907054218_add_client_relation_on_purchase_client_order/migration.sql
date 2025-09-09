-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "reqClientId" TEXT;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_reqClientId_fkey" FOREIGN KEY ("reqClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
