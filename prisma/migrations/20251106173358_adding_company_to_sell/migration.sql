-- AddForeignKey
ALTER TABLE "Sell" ADD CONSTRAINT "Sell_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
