-- AlterTable
ALTER TABLE "TrialApplication" ADD COLUMN     "authorizedRepresentative" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "devicesOther" TEXT,
ADD COLUMN     "languageOther" TEXT,
ADD COLUMN     "modulesOther" TEXT,
ADD COLUMN     "ndaAgreed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationTypeOther" TEXT,
ADD COLUMN     "signature" TEXT,
ADD COLUMN     "signatureDate" TIMESTAMP(3),
ADD COLUMN     "trialDurationOther" TEXT,
ADD COLUMN     "trialUnderstanding" BOOLEAN NOT NULL DEFAULT false;
