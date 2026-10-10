-- CreateEnum
CREATE TYPE "ActivationStatus" AS ENUM ('DOCUMENTS_PENDING', 'SUBMITTED', 'CHANGES_REQUESTED', 'SENT_TO_RRA', 'TRACKING_CODE_READY', 'ACTIVATION_SCHEDULED', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivationDocumentType" AS ENUM ('RDB_CERTIFICATE', 'NATIONAL_ID', 'VSDC_FORM', 'USER_AGREEMENT', 'PREVIOUS_PROVIDER_TERMINATION');

-- CreateEnum
CREATE TYPE "ActivationDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CompanyActivation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "ActivationStatus" NOT NULL DEFAULT 'DOCUMENTS_PENDING',
    "deviceType" TEXT,
    "deviceContactName" TEXT,
    "deviceContactPhone" TEXT,
    "usedPreviousEbm" BOOLEAN NOT NULL DEFAULT false,
    "previousProvider" TEXT,
    "confirmedNoPendingTransactions" BOOLEAN NOT NULL DEFAULT false,
    "confirmedTinValid" BOOLEAN NOT NULL DEFAULT false,
    "confirmedPreviousEbmInstalled" BOOLEAN NOT NULL DEFAULT false,
    "acceptedTermsAt" TIMESTAMP(3),
    "rraTrackingCode" TEXT,
    "activationDate" TIMESTAMP(3),
    "activationVenue" TEXT,
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationDocument" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "type" "ActivationDocumentType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "status" "ActivationDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ActivationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationEvent" (
    "id" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "fromStatus" "ActivationStatus",
    "toStatus" "ActivationStatus" NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyActivation_companyId_key" ON "CompanyActivation"("companyId");

-- CreateIndex
CREATE INDEX "CompanyActivation_status_idx" ON "CompanyActivation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationDocument_activationId_type_key" ON "ActivationDocument"("activationId", "type");

-- CreateIndex
CREATE INDEX "ActivationEvent_activationId_createdAt_idx" ON "ActivationEvent"("activationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CompanyActivation" ADD CONSTRAINT "CompanyActivation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationDocument" ADD CONSTRAINT "ActivationDocument_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "CompanyActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "CompanyActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
