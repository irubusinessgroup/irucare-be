-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('CLINIC_HOSPITAL', 'PHARMACEUTICAL_DISTRIBUTOR', 'LOGISTICS_COMPANY', 'RETAILER', 'OTHER');

-- CreateEnum
CREATE TYPE "TrialModule" AS ENUM ('CLINIC', 'STOCK_MANAGEMENT', 'SUPPLY_LOGISTICS_TRACKING', 'REPORTING_ANALYTICS', 'MULTI_BRANCH_COORDINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('ENGLISH', 'FRENCH', 'KINYARWANDA', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('COMPUTERS', 'TABLETS', 'PHONES', 'OTHER');

-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ACTIVE', 'EXPIRED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "DemoStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "TrialApplication" (
    "id" TEXT NOT NULL,
    "applicationNumber" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "organizationType" "OrganizationType" NOT NULL,
    "countryCity" TEXT NOT NULL,
    "businessRegNumber" TEXT,
    "website" TEXT,
    "contactFirstName" TEXT NOT NULL,
    "contactLastName" TEXT NOT NULL,
    "contactPosition" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactWhatsApp" TEXT,
    "modules" "TrialModule"[],
    "otherModules" TEXT,
    "approximateUsers" INTEGER NOT NULL,
    "preferredLanguage" "PreferredLanguage" NOT NULL,
    "hasStableInternet" BOOLEAN NOT NULL,
    "devices" "DeviceType"[],
    "otherDevices" TEXT,
    "preferredStartDate" TIMESTAMP(3),
    "trialDuration" INTEGER NOT NULL,
    "ndaSigned" BOOLEAN NOT NULL DEFAULT false,
    "ndaSignedAt" TIMESTAMP(3),
    "feedbackAgreed" BOOLEAN NOT NULL DEFAULT false,
    "dataUsageAgreed" BOOLEAN NOT NULL DEFAULT false,
    "status" "TrialStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "trialAccountId" TEXT,
    "trialStartDate" TIMESTAMP(3),
    "trialEndDate" TIMESTAMP(3),
    "demoScheduled" BOOLEAN NOT NULL DEFAULT false,
    "demoScheduledDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialFeedback" (
    "id" TEXT NOT NULL,
    "trialApplicationId" TEXT NOT NULL,
    "feedbackMonth" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comments" TEXT NOT NULL,
    "improvements" TEXT,
    "wouldRecommend" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoRequest" (
    "id" TEXT NOT NULL,
    "trialApplicationId" TEXT,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "interestedModules" "TrialModule"[],
    "preferredDate" TIMESTAMP(3),
    "preferredTime" TEXT,
    "timezone" TEXT,
    "additionalNotes" TEXT,
    "status" "DemoStatus" NOT NULL DEFAULT 'REQUESTED',
    "scheduledDate" TIMESTAMP(3),
    "meetingLink" TEXT,
    "assignedTo" TEXT,
    "completedAt" TIMESTAMP(3),
    "followUpNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialApplication_applicationNumber_key" ON "TrialApplication"("applicationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TrialApplication_trialAccountId_key" ON "TrialApplication"("trialAccountId");

-- CreateIndex
CREATE INDEX "TrialFeedback_trialApplicationId_idx" ON "TrialFeedback"("trialApplicationId");

-- AddForeignKey
ALTER TABLE "TrialFeedback" ADD CONSTRAINT "TrialFeedback_trialApplicationId_fkey" FOREIGN KEY ("trialApplicationId") REFERENCES "TrialApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoRequest" ADD CONSTRAINT "DemoRequest_trialApplicationId_fkey" FOREIGN KEY ("trialApplicationId") REFERENCES "TrialApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
