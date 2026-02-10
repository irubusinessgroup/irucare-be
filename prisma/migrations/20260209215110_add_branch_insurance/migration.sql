-- CreateTable
CREATE TABLE "BranchInsurance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "isrccCd" VARCHAR(20) NOT NULL,
    "isrccNm" TEXT NOT NULL,
    "isrcRt" DECIMAL(5,2) NOT NULL,
    "useYn" VARCHAR(1) NOT NULL DEFAULT 'Y',
    "ebmSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchInsurance_companyId_idx" ON "BranchInsurance"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchInsurance_companyId_isrccCd_key" ON "BranchInsurance"("companyId", "isrccCd");
