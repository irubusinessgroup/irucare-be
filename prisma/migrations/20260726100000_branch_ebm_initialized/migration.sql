-- AlterTable
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "isEbmInitialized" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Branch" ADD COLUMN IF NOT EXISTS "ebmDeviceSerialNumber" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Branch_companyId_isEbmInitialized_idx" ON "Branch"("companyId", "isEbmInitialized");

-- Unique company+bhfId (skip if already present)
DO $$ BEGIN
  ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_bhfId_key" UNIQUE ("companyId", "bhfId");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN unique_violation THEN NULL;
END $$;

-- Backfill: mark branch matching CompanyTools.ebmBhfId as initialized
UPDATE "Branch" b
SET
  "isEbmInitialized" = true,
  "ebmDeviceSerialNumber" = ct."ebmDeviceSerialNumber"
FROM "CompanyTools" ct
WHERE ct."companyId" = b."companyId"
  AND ct."ebmBhfId" IS NOT NULL
  AND b."bhfId" = ct."ebmBhfId";
