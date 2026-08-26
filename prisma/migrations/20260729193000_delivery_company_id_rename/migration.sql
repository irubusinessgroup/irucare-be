-- Rename Delivery.supplierCompanyId → companyId (sale-invoice delivery: our company + client)
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_supplierCompanyId_fkey";
ALTER TABLE "Delivery" RENAME COLUMN "supplierCompanyId" TO "companyId";
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
