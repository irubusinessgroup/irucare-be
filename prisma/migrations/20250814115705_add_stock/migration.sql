/*
  Warnings:

  - You are about to drop the column `approval_status` on the `Approvals` table. All the data in the column will be lost.
  - You are about to drop the column `approved_by_user_id` on the `Approvals` table. All the data in the column will be lost.
  - You are about to drop the column `date_approved` on the `Approvals` table. All the data in the column will be lost.
  - You are about to drop the column `receipt_id` on the `Approvals` table. All the data in the column will be lost.
  - You are about to drop the column `category_name` on the `ItemCategories` table. All the data in the column will be lost.
  - You are about to drop the column `company_id` on the `ItemCategories` table. All the data in the column will be lost.
  - You are about to drop the column `barcode_qr_code` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `brand_manufacturer` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `category_id` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `company_id` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `created_by_user_id` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `item_code_sku` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `item_full_name` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `pack_size` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `temp_req_id` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `uom_id` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `updated_by_user_id` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `company_id` on the `Suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `contact_person` on the `Suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `created_at` on the `Suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `created_by_user_id` on the `Suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `Suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `phone_number` on the `Suppliers` table. All the data in the column will be lost.
  - You are about to drop the column `supplier_name` on the `Suppliers` table. All the data in the column will be lost.
  - You are about to drop the `ConditionTypes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Currencies` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Drugs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DrugsCategories` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Invoices` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PurchaseOrders` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockBatches` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockReceipts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StockSerials` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `StorageLocations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TemperatureRequirements` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UnitsOfMeasure` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[categoryName]` on the table `ItemCategories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[itemCodeSku]` on the table `Items` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `approvalStatus` to the `Approvals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `approvedByUserId` to the `Approvals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateApproved` to the `Approvals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stockId` to the `Approvals` table without a default value. This is not possible if the table is not empty.
  - Added the required column `categoryName` to the `ItemCategories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `ItemCategories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `categoryId` to the `Items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `Items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `itemCodeSku` to the `Items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `itemFullName` to the `Items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `Suppliers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contactPerson` to the `Suppliers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phoneNumber` to the `Suppliers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `supplierName` to the `Suppliers` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Approvals" DROP CONSTRAINT "Approvals_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Approvals" DROP CONSTRAINT "Approvals_receipt_id_fkey";

-- DropForeignKey
ALTER TABLE "Drugs" DROP CONSTRAINT "Drugs_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Drugs" DROP CONSTRAINT "Drugs_drugCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "DrugsCategories" DROP CONSTRAINT "DrugsCategories_companyId_fkey";

-- DropForeignKey
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_currency_id_fkey";

-- DropForeignKey
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_po_id_fkey";

-- DropForeignKey
ALTER TABLE "Invoices" DROP CONSTRAINT "Invoices_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "ItemCategories" DROP CONSTRAINT "ItemCategories_company_id_fkey";

-- DropForeignKey
ALTER TABLE "Items" DROP CONSTRAINT "Items_category_id_fkey";

-- DropForeignKey
ALTER TABLE "Items" DROP CONSTRAINT "Items_company_id_fkey";

-- DropForeignKey
ALTER TABLE "Items" DROP CONSTRAINT "Items_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Items" DROP CONSTRAINT "Items_temp_req_id_fkey";

-- DropForeignKey
ALTER TABLE "Items" DROP CONSTRAINT "Items_uom_id_fkey";

-- DropForeignKey
ALTER TABLE "Items" DROP CONSTRAINT "Items_updated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrders" DROP CONSTRAINT "PurchaseOrders_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrders" DROP CONSTRAINT "PurchaseOrders_currency_id_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseOrders" DROP CONSTRAINT "PurchaseOrders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "StockBatches" DROP CONSTRAINT "StockBatches_receipt_id_fkey";

-- DropForeignKey
ALTER TABLE "StockBatches" DROP CONSTRAINT "StockBatches_updated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_company_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_condition_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_currency_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_item_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_po_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_received_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_registered_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_storage_location_id_fkey";

-- DropForeignKey
ALTER TABLE "StockReceipts" DROP CONSTRAINT "StockReceipts_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "StockSerials" DROP CONSTRAINT "StockSerials_receipt_id_fkey";

-- DropForeignKey
ALTER TABLE "StockSerials" DROP CONSTRAINT "StockSerials_updated_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "Suppliers" DROP CONSTRAINT "Suppliers_company_id_fkey";

-- DropForeignKey
ALTER TABLE "Suppliers" DROP CONSTRAINT "Suppliers_created_by_user_id_fkey";

-- DropIndex
DROP INDEX "Contact_conversationId_idx";

-- DropIndex
DROP INDEX "Contact_email_idx";

-- DropIndex
DROP INDEX "ItemCategories_category_name_key";

-- DropIndex
DROP INDEX "Items_item_code_sku_key";

-- DropIndex
DROP INDEX "Notification_createdAt_idx";

-- DropIndex
DROP INDEX "Notification_isRead_idx";

-- DropIndex
DROP INDEX "Notification_userId_idx";

-- DropIndex
DROP INDEX "idx_entity";

-- DropIndex
DROP INDEX "idx_user_entity";

-- DropIndex
DROP INDEX "idx_user_unread";

-- AlterTable
ALTER TABLE "Approvals" DROP COLUMN "approval_status",
DROP COLUMN "approved_by_user_id",
DROP COLUMN "date_approved",
DROP COLUMN "receipt_id",
ADD COLUMN     "approvalStatus" TEXT NOT NULL,
ADD COLUMN     "approvedByUserId" TEXT NOT NULL,
ADD COLUMN     "dateApproved" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "stockId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ItemCategories" DROP COLUMN "category_name",
DROP COLUMN "company_id",
ADD COLUMN     "categoryName" TEXT NOT NULL,
ADD COLUMN     "companyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Items" DROP COLUMN "barcode_qr_code",
DROP COLUMN "brand_manufacturer",
DROP COLUMN "category_id",
DROP COLUMN "company_id",
DROP COLUMN "created_at",
DROP COLUMN "created_by_user_id",
DROP COLUMN "is_active",
DROP COLUMN "item_code_sku",
DROP COLUMN "item_full_name",
DROP COLUMN "pack_size",
DROP COLUMN "temp_req_id",
DROP COLUMN "uom_id",
DROP COLUMN "updated_at",
DROP COLUMN "updated_by_user_id",
ADD COLUMN     "barcodeQrCode" TEXT,
ADD COLUMN     "batchLotNumber" TEXT,
ADD COLUMN     "brandManufacturer" TEXT,
ADD COLUMN     "categoryId" TEXT NOT NULL,
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "itemCodeSku" TEXT NOT NULL,
ADD COLUMN     "itemFullName" TEXT NOT NULL,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Suppliers" DROP COLUMN "company_id",
DROP COLUMN "contact_person",
DROP COLUMN "created_at",
DROP COLUMN "created_by_user_id",
DROP COLUMN "is_active",
DROP COLUMN "phone_number",
DROP COLUMN "supplier_name",
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "contactPerson" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "phoneNumber" TEXT NOT NULL,
ADD COLUMN     "supplierName" TEXT NOT NULL;

-- DropTable
DROP TABLE "ConditionTypes";

-- DropTable
DROP TABLE "Currencies";

-- DropTable
DROP TABLE "Drugs";

-- DropTable
DROP TABLE "DrugsCategories";

-- DropTable
DROP TABLE "Invoices";

-- DropTable
DROP TABLE "PurchaseOrders";

-- DropTable
DROP TABLE "StockBatches";

-- DropTable
DROP TABLE "StockReceipts";

-- DropTable
DROP TABLE "StockSerials";

-- DropTable
DROP TABLE "StorageLocations";

-- DropTable
DROP TABLE "TemperatureRequirements";

-- DropTable
DROP TABLE "UnitsOfMeasure";

-- DropEnum
DROP TYPE "SerialsStatus";

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "purchaseOrderNo" TEXT,
    "invoiceNo" TEXT,
    "supplierId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "quantityReceived" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "packSize" DECIMAL(10,2),
    "uom" TEXT NOT NULL,
    "tempReq" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL,
    "specialHandlingNotes" TEXT,
    "remarksNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategories_categoryName_key" ON "ItemCategories"("categoryName");

-- CreateIndex
CREATE UNIQUE INDEX "Items_itemCodeSku_key" ON "Items"("itemCodeSku");

-- AddForeignKey
ALTER TABLE "ItemCategories" ADD CONSTRAINT "ItemCategories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppliers" ADD CONSTRAINT "Suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Items" ADD CONSTRAINT "Items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Items" ADD CONSTRAINT "Items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approvals" ADD CONSTRAINT "Approvals_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approvals" ADD CONSTRAINT "Approvals_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
