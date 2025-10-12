-- AlterTable
ALTER TABLE "Sell" ADD COLUMN     "insuranceCardId" TEXT,
ADD COLUMN     "insuranceCoveredAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insurancePercentage" DECIMAL(5,2),
ADD COLUMN     "patientId" TEXT,
ADD COLUMN     "patientPayableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SellItem" ADD COLUMN     "insuranceCoveredPerUnit" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "patientPricePerUnit" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Sell_patientId_idx" ON "Sell"("patientId");

-- CreateIndex
CREATE INDEX "Sell_insuranceCardId_idx" ON "Sell"("insuranceCardId");

-- AddForeignKey
ALTER TABLE "Sell" ADD CONSTRAINT "Sell_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sell" ADD CONSTRAINT "Sell_insuranceCardId_fkey" FOREIGN KEY ("insuranceCardId") REFERENCES "InsuranceCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
