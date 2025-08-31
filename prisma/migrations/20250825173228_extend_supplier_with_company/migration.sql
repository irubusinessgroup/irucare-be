-- AlterTable
ALTER TABLE "Suppliers" ADD COLUMN     "supplierCompanyId" TEXT;

-- AddForeignKey
ALTER TABLE "Suppliers" ADD CONSTRAINT "Suppliers_supplierCompanyId_fkey" FOREIGN KEY ("supplierCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
