-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "costPrice" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "expectedDeliveryDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
