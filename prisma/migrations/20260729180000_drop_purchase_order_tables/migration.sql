-- Drop FKs referencing purchase-order tables
ALTER TABLE "StockReceipts" DROP CONSTRAINT IF EXISTS "StockReceipts_purchaseOrderId_fkey";
ALTER TABLE "StockReceipts" DROP CONSTRAINT IF EXISTS "StockReceipts_purchaseOrderItemId_fkey";
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_purchaseOrderId_fkey";
ALTER TABLE "DeliveryItem" DROP CONSTRAINT IF EXISTS "DeliveryItem_purchaseOrderItemId_fkey";
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT IF EXISTS "PurchaseOrderItem_purchaseOrderId_fkey";
ALTER TABLE "PurchaseOrderItem" DROP CONSTRAINT IF EXISTS "PurchaseOrderItem_itemId_fkey";
ALTER TABLE "PurchaseOrderProcessing" DROP CONSTRAINT IF EXISTS "PurchaseOrderProcessing_purchaseOrderId_fkey";
ALTER TABLE "PurchaseOrderProcessing" DROP CONSTRAINT IF EXISTS "PurchaseOrderProcessing_companyFromId_fkey";
ALTER TABLE "PurchaseOrderProcessing" DROP CONSTRAINT IF EXISTS "PurchaseOrderProcessing_companyToId_fkey";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_companyId_fkey";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_supplierId_fkey";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_reqById_fkey";
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_reqClientId_fkey";

-- Drop columns that referenced purchase orders
ALTER TABLE "StockReceipts" DROP COLUMN IF EXISTS "purchaseOrderId";
ALTER TABLE "StockReceipts" DROP COLUMN IF EXISTS "purchaseOrderItemId";
ALTER TABLE "Delivery" DROP COLUMN IF EXISTS "purchaseOrderId";
ALTER TABLE "DeliveryItem" DROP COLUMN IF EXISTS "purchaseOrderItemId";

-- Drop tables (children first)
DROP TABLE IF EXISTS "PurchaseOrderProcessing";
DROP TABLE IF EXISTS "PurchaseOrderItem";
DROP TABLE IF EXISTS "PurchaseOrder";

-- Drop unused enums
DROP TYPE IF EXISTS "ProcessingStatus";
DROP TYPE IF EXISTS "POApprovalStatus";
DROP TYPE IF EXISTS "ItemApprovalStatus";
