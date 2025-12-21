-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "CareProgram" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "CareProgramEnrollment" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "CareProgramVisit" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "ClinicBilling" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "ClinicalNote" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "CompanyUser" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Diagnosis" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "DirectInvoice" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Encounter" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "ImagingOrder" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Insurance" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "InsuranceCard" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "InsuranceClaim" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "ItemCategories" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Items" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "LabOrder" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "LabQualityControl" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "LabResult" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "LabTest" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "LabTurnaroundStats" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "OtcSales" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PharmacyAdjustments" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PharmacyDispenses" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PharmacyReturns" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "ProcedureOrder" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderProcessing" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "ReorderRule" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Sell" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "SellItem" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "StockAdjustment" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "StockAlert" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "StockIssuance" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "StockReceipts" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Suppliers" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Triage" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "patient_allergies" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyUser" ADD CONSTRAINT "CompanyUser_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
