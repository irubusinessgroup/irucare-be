-- CreateEnum
CREATE TYPE "SerialsStatus" AS ENUM ('IN_STOCK', 'ISSUED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('PENDING', 'RESOLVED');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "conversationId" TEXT,
ADD COLUMN     "status" "ContactStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ContactReply" ADD COLUMN     "adminName" TEXT;

-- CreateTable
CREATE TABLE "ItemCategories" (
    "id" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ItemCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitsOfMeasure" (
    "id" TEXT NOT NULL,
    "uom_name" TEXT NOT NULL,
    "abbreviation" TEXT,

    CONSTRAINT "UnitsOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currencies" (
    "id" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,

    CONSTRAINT "Currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConditionTypes" (
    "id" TEXT NOT NULL,
    "condition_name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "ConditionTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemperatureRequirements" (
    "id" TEXT NOT NULL,
    "temp_req_name" TEXT NOT NULL,
    "min_temp_celsius" DECIMAL(5,2),
    "max_temp_celsius" DECIMAL(5,2),

    CONSTRAINT "TemperatureRequirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppliers" (
    "id" TEXT NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "contact_person" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,

    CONSTRAINT "Suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Items" (
    "id" TEXT NOT NULL,
    "item_code_sku" TEXT NOT NULL,
    "item_full_name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT,
    "brand_manufacturer" TEXT,
    "barcode_qr_code" TEXT NOT NULL,
    "pack_size" DECIMAL(10,2),
    "uom_id" TEXT NOT NULL,
    "temp_req_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "Items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocations" (
    "id" TEXT NOT NULL,
    "location_name" TEXT NOT NULL,
    "location_type" TEXT,
    "description" TEXT,

    CONSTRAINT "StorageLocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "location_type" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_delivery_date" TIMESTAMP(3),
    "total_amount" DECIMAL(18,2),
    "currency_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,

    CONSTRAINT "PurchaseOrders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "po_id" TEXT,
    "supplier_id" TEXT NOT NULL,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "currency_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT NOT NULL,

    CONSTRAINT "Invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceipts" (
    "id" TEXT NOT NULL,
    "form_code" TEXT,
    "item_id" TEXT NOT NULL,
    "po_id" TEXT,
    "invoice_id" TEXT,
    "supplier_id" TEXT NOT NULL,
    "date_received" TIMESTAMP(3) NOT NULL,
    "quantity_received" DECIMAL(10,2) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "total_cost" DECIMAL(18,2) NOT NULL,
    "currency_id" TEXT NOT NULL,
    "condition_id" TEXT NOT NULL,
    "storage_location_id" TEXT NOT NULL,
    "special_handling_notes" TEXT,
    "remarks_notes" TEXT,
    "registered_by_user_id" TEXT NOT NULL,
    "received_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockReceipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatches" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "batch_lot_number" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "quantity_in_batch" DECIMAL(10,2) NOT NULL,
    "current_stock_quantity" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "StockBatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockSerials" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "current_status" "SerialsStatus" NOT NULL DEFAULT 'IN_STOCK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "StockSerials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approvals" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT NOT NULL,
    "date_approved" TIMESTAMP(3) NOT NULL,
    "approval_status" TEXT NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemCategories_category_name_key" ON "ItemCategories"("category_name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitsOfMeasure_uom_name_key" ON "UnitsOfMeasure"("uom_name");

-- CreateIndex
CREATE UNIQUE INDEX "UnitsOfMeasure_abbreviation_key" ON "UnitsOfMeasure"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "Currencies_currency_code_key" ON "Currencies"("currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "ConditionTypes_condition_name_key" ON "ConditionTypes"("condition_name");

-- CreateIndex
CREATE UNIQUE INDEX "TemperatureRequirements_temp_req_name_key" ON "TemperatureRequirements"("temp_req_name");

-- CreateIndex
CREATE UNIQUE INDEX "Suppliers_email_key" ON "Suppliers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Items_item_code_sku_key" ON "Items"("item_code_sku");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrders_po_number_key" ON "PurchaseOrders"("po_number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoices_invoice_number_key" ON "Invoices"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatches_receipt_id_batch_lot_number_key" ON "StockBatches"("receipt_id", "batch_lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "StockSerials_serial_number_key" ON "StockSerials"("serial_number");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_conversationId_idx" ON "Contact"("conversationId");

-- AddForeignKey
ALTER TABLE "Suppliers" ADD CONSTRAINT "Suppliers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Items" ADD CONSTRAINT "Items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "ItemCategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Items" ADD CONSTRAINT "Items_uom_id_fkey" FOREIGN KEY ("uom_id") REFERENCES "UnitsOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Items" ADD CONSTRAINT "Items_temp_req_id_fkey" FOREIGN KEY ("temp_req_id") REFERENCES "TemperatureRequirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Items" ADD CONSTRAINT "Items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Items" ADD CONSTRAINT "Items_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrders" ADD CONSTRAINT "PurchaseOrders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrders" ADD CONSTRAINT "PurchaseOrders_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrders" ADD CONSTRAINT "PurchaseOrders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "Items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "PurchaseOrders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "Currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_condition_id_fkey" FOREIGN KEY ("condition_id") REFERENCES "ConditionTypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "StorageLocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_registered_by_user_id_fkey" FOREIGN KEY ("registered_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipts" ADD CONSTRAINT "StockReceipts_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatches" ADD CONSTRAINT "StockBatches_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "StockReceipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatches" ADD CONSTRAINT "StockBatches_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSerials" ADD CONSTRAINT "StockSerials_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "StockReceipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSerials" ADD CONSTRAINT "StockSerials_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approvals" ADD CONSTRAINT "Approvals_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "StockReceipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approvals" ADD CONSTRAINT "Approvals_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
