-- DropForeignKey
ALTER TABLE "Sell" DROP CONSTRAINT "Sell_clientId_fkey";

-- AlterTable
ALTER TABLE "Sell" ALTER COLUMN "clientId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Sell" ADD CONSTRAINT "Sell_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
