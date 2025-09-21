-- DropForeignKey
ALTER TABLE "Sell" DROP CONSTRAINT "Sell_itemId_fkey";

-- AlterTable
ALTER TABLE "Sell" ALTER COLUMN "itemId" DROP NOT NULL,
ALTER COLUMN "quantity" DROP NOT NULL,
ALTER COLUMN "sellPrice" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SellItem" (
    "id" TEXT NOT NULL,
    "sellId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "sellPrice" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Sell" ADD CONSTRAINT "Sell_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellItem" ADD CONSTRAINT "SellItem_sellId_fkey" FOREIGN KEY ("sellId") REFERENCES "Sell"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellItem" ADD CONSTRAINT "SellItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
