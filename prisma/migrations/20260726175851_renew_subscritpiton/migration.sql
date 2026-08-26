-- Subscription defaults + indexes for access checks.
-- FK to Plan already exists from initialization; do not re-add it here.
ALTER TABLE "Subscription" ALTER COLUMN "isActive" SET DEFAULT false;

CREATE INDEX IF NOT EXISTS "Subscription_companyId_isActive_idx"
  ON "Subscription"("companyId", "isActive");

CREATE INDEX IF NOT EXISTS "Subscription_companyId_endDate_idx"
  ON "Subscription"("companyId", "endDate");
