-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "directInvoiceId" TEXT;

-- AddForeignKey
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_directInvoiceId_fkey" FOREIGN KEY ("directInvoiceId") REFERENCES "DirectInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
