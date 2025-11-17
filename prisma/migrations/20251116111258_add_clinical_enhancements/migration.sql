-- AlterTable
ALTER TABLE "ClinicBilling" ADD COLUMN     "paymentGateway" TEXT,
ADD COLUMN     "paymentReceiptUrl" TEXT,
ADD COLUMN     "transactionId" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "fulfilledDate" TIMESTAMP(3),
ADD COLUMN     "itemId" TEXT,
ADD COLUMN     "pharmacistId" TEXT,
ADD COLUMN     "pickedUpBy" TEXT,
ADD COLUMN     "pickedUpDate" TIMESTAMP(3),
ADD COLUMN     "quantityDispensed" INTEGER,
ADD COLUMN     "validationWarnings" JSONB,
ADD COLUMN     "warehouseId" TEXT;

-- CreateTable
CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentGateway" TEXT,
    "transactionId" TEXT,
    "paymentReceiptUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "insuranceCardId" TEXT NOT NULL,
    "encounterId" TEXT,
    "billingId" TEXT,
    "claimNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "diagnosisCodes" TEXT[],
    "procedureCodes" TEXT[],
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "approvedAmount" DECIMAL(10,2),
    "rejectedAmount" DECIMAL(10,2),
    "claimFileUrl" TEXT,
    "responseFileUrl" TEXT,
    "submittedDate" TIMESTAMP(3),
    "responseDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingPayment_billingId_idx" ON "BillingPayment"("billingId");

-- CreateIndex
CREATE INDEX "BillingPayment_status_idx" ON "BillingPayment"("status");

-- CreateIndex
CREATE INDEX "BillingPayment_paidAt_idx" ON "BillingPayment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_claimNumber_key" ON "InsuranceClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "InsuranceClaim_patientId_idx" ON "InsuranceClaim"("patientId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_insuranceCardId_idx" ON "InsuranceClaim"("insuranceCardId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_encounterId_idx" ON "InsuranceClaim"("encounterId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_billingId_idx" ON "InsuranceClaim"("billingId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_status_idx" ON "InsuranceClaim"("status");

-- CreateIndex
CREATE INDEX "InsuranceClaim_claimNumber_idx" ON "InsuranceClaim"("claimNumber");

-- CreateIndex
CREATE INDEX "InsuranceClaim_submittedDate_idx" ON "InsuranceClaim"("submittedDate");

-- CreateIndex
CREATE INDEX "Prescription_itemId_idx" ON "Prescription"("itemId");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_pharmacistId_fkey" FOREIGN KEY ("pharmacistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "ClinicBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_insuranceCardId_fkey" FOREIGN KEY ("insuranceCardId") REFERENCES "InsuranceCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "ClinicBilling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
