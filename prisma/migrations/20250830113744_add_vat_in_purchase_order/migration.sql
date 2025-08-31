-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "grandTotal" DECIMAL(18,4),
ADD COLUMN     "subtotal" DECIMAL(18,4),
ADD COLUMN     "vat" DECIMAL(18,4),
ADD COLUMN     "vatRate" DOUBLE PRECISION;
