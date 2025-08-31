-- CreateTable
CREATE TABLE "CompanyTools" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sellingPercentage" INTEGER,
    "companySignature" TEXT,
    "companyStamp" TEXT,

    CONSTRAINT "CompanyTools_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompanyTools" ADD CONSTRAINT "CompanyTools_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
