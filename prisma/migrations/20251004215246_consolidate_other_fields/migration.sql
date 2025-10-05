/*
  Warnings:

  - The `interestedModules` column on the `DemoRequest` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `devicesOther` on the `TrialApplication` table. All the data in the column will be lost.
  - You are about to drop the column `languageOther` on the `TrialApplication` table. All the data in the column will be lost.
  - You are about to drop the column `modulesOther` on the `TrialApplication` table. All the data in the column will be lost.
  - You are about to drop the column `organizationTypeOther` on the `TrialApplication` table. All the data in the column will be lost.
  - You are about to drop the column `otherDevices` on the `TrialApplication` table. All the data in the column will be lost.
  - You are about to drop the column `otherModules` on the `TrialApplication` table. All the data in the column will be lost.
  - You are about to drop the column `trialDurationOther` on the `TrialApplication` table. All the data in the column will be lost.
  - The `modules` column on the `TrialApplication` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `devices` column on the `TrialApplication` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `organizationType` on the `TrialApplication` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `preferredLanguage` on the `TrialApplication` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "DemoRequest" DROP COLUMN "interestedModules",
ADD COLUMN     "interestedModules" TEXT[];

-- AlterTable
ALTER TABLE "TrialApplication" DROP COLUMN "devicesOther",
DROP COLUMN "languageOther",
DROP COLUMN "modulesOther",
DROP COLUMN "organizationTypeOther",
DROP COLUMN "otherDevices",
DROP COLUMN "otherModules",
DROP COLUMN "trialDurationOther",
DROP COLUMN "organizationType",
ADD COLUMN     "organizationType" TEXT NOT NULL,
DROP COLUMN "modules",
ADD COLUMN     "modules" TEXT[],
DROP COLUMN "preferredLanguage",
ADD COLUMN     "preferredLanguage" TEXT NOT NULL,
DROP COLUMN "devices",
ADD COLUMN     "devices" TEXT[];

-- DropEnum
DROP TYPE "DeviceType";

-- DropEnum
DROP TYPE "OrganizationType";

-- DropEnum
DROP TYPE "PreferredLanguage";

-- DropEnum
DROP TYPE "TrialModule";
