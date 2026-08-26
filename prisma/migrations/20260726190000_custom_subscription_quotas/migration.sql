-- Custom partnership subscriptions: users/locations quotas; plan optional.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "usersCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "locationsCount" INTEGER NOT NULL DEFAULT 1;

-- Allow subscriptions without a Plan catalog row
ALTER TABLE "Subscription" ALTER COLUMN "planId" DROP NOT NULL;

-- Replace Plan FK: RESTRICT → SET NULL so custom (planId=null) subscriptions work
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Subscription_planId_fkey'
      AND table_name = 'Subscription'
  ) THEN
    ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_planId_fkey";
  END IF;
END $$;

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Subscription"
SET "selectedPlan" = COALESCE(NULLIF("selectedPlan", ''), 'Custom partnership')
WHERE "selectedPlan" IS NULL OR "selectedPlan" = '';
