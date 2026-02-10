-- CreateTable
CREATE TABLE "EbmCodeSyncStatus" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "totalCodesSynced" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EbmCodeSyncStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EbmCodeSyncStatus_companyId_key" ON "EbmCodeSyncStatus"("companyId");

-- CreateIndex
CREATE INDEX "EbmCodeSyncStatus_companyId_syncStatus_idx" ON "EbmCodeSyncStatus"("companyId", "syncStatus");
