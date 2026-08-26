-- AlterTable
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "allowVatModeSwitch" BOOLEAN NOT NULL DEFAULT false;
