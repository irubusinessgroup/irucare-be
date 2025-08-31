-- DropIndex
DROP INDEX "ItemCategories_categoryName_key";

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "reqById" TEXT;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_reqById_fkey" FOREIGN KEY ("reqById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
