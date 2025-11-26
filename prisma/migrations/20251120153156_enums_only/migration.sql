/*
  Warnings:

  - You are about to drop the column `notes` on the `Encounter` table. All the data in the column will be lost.
  - You are about to drop the column `collectedDate` on the `LabOrder` table. All the data in the column will be lost.
  - You are about to drop the column `completedDate` on the `LabOrder` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `LabOrder` table. All the data in the column will be lost.
  - You are about to drop the column `orderType` on the `LabOrder` table. All the data in the column will be lost.
  - You are about to drop the column `orderedDate` on the `LabOrder` table. All the data in the column will be lost.
  - You are about to drop the column `results` on the `LabOrder` table. All the data in the column will be lost.
  - You are about to drop the column `tests` on the `LabOrder` table. All the data in the column will be lost.
  - The `status` column on the `LabOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `createdBy` on the `Prescription` table. All the data in the column will be lost.
  - You are about to drop the column `fulfilledDate` on the `Prescription` table. All the data in the column will be lost.
  - You are about to drop the column `items` on the `Prescription` table. All the data in the column will be lost.
  - You are about to drop the column `pharmacistId` on the `Prescription` table. All the data in the column will be lost.
  - You are about to drop the column `prescribedDate` on the `Prescription` table. All the data in the column will be lost.
  - You are about to drop the `EMR` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `companyId` to the `Encounter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `companyId` to the `LabOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderedBy` to the `LabOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `testId` to the `LabOrder` table without a default value. This is not possible if the table is not empty.
  - Added the required column `testName` to the `LabOrder` table without a default value. This is not possible if the table is not empty.
  - Made the column `encounterId` on table `LabOrder` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `companyId` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dosage` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `frequency` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `medicationName` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prescribedBy` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `route` to the `Prescription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `Prescription` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('OUTPATIENT', 'INPATIENT', 'EMERGENCY', 'FOLLOW_UP', 'WELLNESS_CHECK');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DiagnosisType" AS ENUM ('PRIMARY', 'SECONDARY', 'DIFFERENTIAL', 'RULED_OUT');

-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('PROGRESS', 'DISCHARGE_SUMMARY', 'REFERRAL_LETTER', 'CONSULTATION', 'PROCEDURE_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "CareProgramType" AS ENUM ('MATERNAL_HEALTH', 'CHILD_HEALTH', 'ANTENATAL_CARE', 'POSTNATAL_CARE', 'CHRONIC_DISEASE', 'DIABETES_MANAGEMENT', 'HYPERTENSION_MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LabTestType" AS ENUM ('SINGLE', 'PANEL', 'PROFILE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EncounterStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "EncounterStatus" ADD VALUE 'NO_SHOW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "OrderStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "OrderStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "OrderStatus" ADD VALUE 'REJECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PrescriptionStatus" ADD VALUE 'DRAFT';
ALTER TYPE "PrescriptionStatus" ADD VALUE 'DISPENSED';
ALTER TYPE "PrescriptionStatus" ADD VALUE 'ON_HOLD';

-- DropForeignKey
ALTER TABLE "EMR" DROP CONSTRAINT "EMR_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "EMR" DROP CONSTRAINT "EMR_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "EMR" DROP CONSTRAINT "EMR_patientId_fkey";

-- DropForeignKey
ALTER TABLE "LabOrder" DROP CONSTRAINT "LabOrder_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "LabOrder" DROP CONSTRAINT "LabOrder_encounterId_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "Prescription" DROP CONSTRAINT "Prescription_pharmacistId_fkey";

-- DropIndex
DROP INDEX "LabOrder_orderedDate_idx";

-- DropIndex
DROP INDEX "LabOrder_scheduledDate_idx";

-- DropIndex
DROP INDEX "Prescription_itemId_idx";

-- DropIndex
DROP INDEX "Prescription_prescribedDate_idx";

-- AlterTable
ALTER TABLE "Encounter" DROP COLUMN "notes",
ADD COLUMN     "checkInTime" TIMESTAMP(3),
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "scheduledTime" TIMESTAMP(3),
ADD COLUMN     "startTime" TIMESTAMP(3),
ADD COLUMN     "visitNumber" TEXT,
ADD COLUMN     "visitType" "VisitType" NOT NULL DEFAULT 'OUTPATIENT',
ALTER COLUMN "status" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LabOrder" DROP COLUMN "collectedDate",
DROP COLUMN "completedDate",
DROP COLUMN "createdBy",
DROP COLUMN "orderType",
DROP COLUMN "orderedDate",
DROP COLUMN "results",
DROP COLUMN "tests",
ADD COLUMN     "clinicalNotes" TEXT,
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "orderNumber" TEXT,
ADD COLUMN     "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "orderedBy" TEXT NOT NULL,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
ADD COLUMN     "sampleCollectedAt" TIMESTAMP(3),
ADD COLUMN     "sampleCollectedBy" TEXT,
ADD COLUMN     "sampleType" TEXT,
ADD COLUMN     "testCategory" TEXT,
ADD COLUMN     "testId" TEXT NOT NULL,
ADD COLUMN     "testName" TEXT NOT NULL,
ALTER COLUMN "encounterId" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Prescription" DROP COLUMN "createdBy",
DROP COLUMN "fulfilledDate",
DROP COLUMN "items",
DROP COLUMN "pharmacistId",
DROP COLUMN "prescribedDate",
ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "companyId" TEXT NOT NULL,
ADD COLUMN     "dispensedBy" TEXT,
ADD COLUMN     "dispensedDate" TIMESTAMP(3),
ADD COLUMN     "dosage" TEXT NOT NULL,
ADD COLUMN     "duration" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "frequency" TEXT NOT NULL,
ADD COLUMN     "indicationForUse" TEXT,
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "isDispensed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPickedUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "medicationName" TEXT NOT NULL,
ADD COLUMN     "prescribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "prescribedBy" TEXT NOT NULL,
ADD COLUMN     "prescriptionNumber" TEXT,
ADD COLUMN     "quantity" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "route" TEXT NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "unit" TEXT NOT NULL,
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "quantityDispensed" SET DATA TYPE DOUBLE PRECISION;

-- DropTable
DROP TABLE "EMR";

-- DropEnum
DROP TYPE "EMRRecordType";

-- DropEnum
DROP TYPE "LabOrderStatus";

-- CreateTable
CREATE TABLE "Triage" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "triageLevel" "TriageLevel" NOT NULL DEFAULT 'ROUTINE',
    "chiefComplaint" TEXT NOT NULL,
    "triageNotes" TEXT,
    "temperature" DOUBLE PRECISION,
    "bloodPressureSystolic" INTEGER,
    "bloodPressureDiastolic" INTEGER,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "oxygenSaturation" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "painScore" INTEGER,
    "allergies" TEXT,
    "currentMedications" TEXT,
    "capturedBy" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Triage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chiefComplaint" TEXT NOT NULL,
    "historyOfPresentingIllness" TEXT,
    "pastMedicalHistory" TEXT,
    "familyHistory" TEXT,
    "socialHistory" TEXT,
    "reviewOfSystems" JSONB,
    "physicalExamination" TEXT,
    "generalAppearance" TEXT,
    "systemicExamination" JSONB,
    "clinicalImpression" TEXT,
    "differentialDiagnosis" TEXT,
    "treatmentPlan" TEXT,
    "followUpInstructions" TEXT,
    "consultedBy" TEXT NOT NULL,
    "consultedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "icdCode" TEXT NOT NULL,
    "icdVersion" TEXT NOT NULL DEFAULT 'ICD-10',
    "diagnosisName" TEXT NOT NULL,
    "diagnosisType" "DiagnosisType" NOT NULL DEFAULT 'PRIMARY',
    "notes" TEXT,
    "onsetDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "diagnosedBy" TEXT NOT NULL,
    "diagnosedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagingOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "imagingType" TEXT NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "clinicalNotes" TEXT,
    "indication" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "reportUrl" TEXT,
    "imagesUrl" TEXT,
    "findings" TEXT,
    "impression" TEXT,
    "reportedBy" TEXT,
    "reportedAt" TIMESTAMP(3),
    "orderedBy" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImagingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcedureOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "procedureName" TEXT NOT NULL,
    "procedureCode" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'ROUTINE',
    "indication" TEXT,
    "notes" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "performedDate" TIMESTAMP(3),
    "performedBy" TEXT,
    "findings" TEXT,
    "complications" TEXT,
    "orderedBy" TEXT NOT NULL,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcedureOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "noteType" "NoteType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "admissionDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "dischargeDiagnosis" TEXT,
    "dischargeInstructions" TEXT,
    "referralTo" TEXT,
    "referralReason" TEXT,
    "referralUrgency" TEXT,
    "attachments" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareProgram" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "programType" "CareProgramType" NOT NULL,
    "description" TEXT,
    "eligibilityCriteria" JSONB,
    "protocolSteps" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareProgramEnrollment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "enrollmentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedEndDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "discontinuationReason" TEXT,
    "currentStage" TEXT,
    "notes" TEXT,
    "enrolledBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareProgramEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareProgramVisit" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "encounterId" TEXT,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "visitType" TEXT NOT NULL,
    "observations" JSONB,
    "measurements" JSONB,
    "assessments" JSONB,
    "interventions" JSONB,
    "nextVisitDate" TIMESTAMP(3),
    "notes" TEXT,
    "conductedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareProgramVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "testCode" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "testType" "LabTestType" NOT NULL DEFAULT 'SINGLE',
    "category" TEXT NOT NULL,
    "description" TEXT,
    "sampleType" TEXT NOT NULL,
    "sampleVolume" TEXT,
    "turnaroundTime" INTEGER,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "panelTests" JSONB,
    "referenceRanges" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabResult" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "testParameter" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "unit" TEXT,
    "referenceRange" TEXT,
    "isAbnormal" BOOLEAN NOT NULL DEFAULT false,
    "abnormalFlag" TEXT,
    "notes" TEXT,
    "resultDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabQualityControl" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "testId" TEXT,
    "controlType" TEXT NOT NULL,
    "controlLevel" TEXT NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "lotNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "expectedValue" TEXT NOT NULL,
    "observedValue" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "deviation" DOUBLE PRECISION,
    "comments" TEXT,
    "performedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabQualityControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTurnaroundStats" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "sampleCollectedAt" TIMESTAMP(3),
    "resultEnteredAt" TIMESTAMP(3),
    "resultApprovedAt" TIMESTAMP(3),
    "collectionToEntry" INTEGER,
    "entryToApproval" INTEGER,
    "totalTurnaround" INTEGER,
    "isWithinTarget" BOOLEAN NOT NULL DEFAULT true,
    "targetTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabTurnaroundStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Triage_encounterId_key" ON "Triage"("encounterId");

-- CreateIndex
CREATE INDEX "Triage_encounterId_idx" ON "Triage"("encounterId");

-- CreateIndex
CREATE INDEX "Triage_patientId_idx" ON "Triage"("patientId");

-- CreateIndex
CREATE INDEX "Triage_companyId_idx" ON "Triage"("companyId");

-- CreateIndex
CREATE INDEX "Triage_capturedAt_idx" ON "Triage"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_encounterId_key" ON "Consultation"("encounterId");

-- CreateIndex
CREATE INDEX "Consultation_encounterId_idx" ON "Consultation"("encounterId");

-- CreateIndex
CREATE INDEX "Consultation_patientId_idx" ON "Consultation"("patientId");

-- CreateIndex
CREATE INDEX "Consultation_companyId_idx" ON "Consultation"("companyId");

-- CreateIndex
CREATE INDEX "Consultation_consultedAt_idx" ON "Consultation"("consultedAt");

-- CreateIndex
CREATE INDEX "Diagnosis_consultationId_idx" ON "Diagnosis"("consultationId");

-- CreateIndex
CREATE INDEX "Diagnosis_encounterId_idx" ON "Diagnosis"("encounterId");

-- CreateIndex
CREATE INDEX "Diagnosis_patientId_idx" ON "Diagnosis"("patientId");

-- CreateIndex
CREATE INDEX "Diagnosis_companyId_idx" ON "Diagnosis"("companyId");

-- CreateIndex
CREATE INDEX "Diagnosis_icdCode_idx" ON "Diagnosis"("icdCode");

-- CreateIndex
CREATE INDEX "Diagnosis_diagnosisType_idx" ON "Diagnosis"("diagnosisType");

-- CreateIndex
CREATE INDEX "ImagingOrder_encounterId_idx" ON "ImagingOrder"("encounterId");

-- CreateIndex
CREATE INDEX "ImagingOrder_patientId_idx" ON "ImagingOrder"("patientId");

-- CreateIndex
CREATE INDEX "ImagingOrder_providerId_idx" ON "ImagingOrder"("providerId");

-- CreateIndex
CREATE INDEX "ImagingOrder_companyId_idx" ON "ImagingOrder"("companyId");

-- CreateIndex
CREATE INDEX "ImagingOrder_status_idx" ON "ImagingOrder"("status");

-- CreateIndex
CREATE INDEX "ImagingOrder_orderNumber_idx" ON "ImagingOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "ProcedureOrder_encounterId_idx" ON "ProcedureOrder"("encounterId");

-- CreateIndex
CREATE INDEX "ProcedureOrder_patientId_idx" ON "ProcedureOrder"("patientId");

-- CreateIndex
CREATE INDEX "ProcedureOrder_providerId_idx" ON "ProcedureOrder"("providerId");

-- CreateIndex
CREATE INDEX "ProcedureOrder_companyId_idx" ON "ProcedureOrder"("companyId");

-- CreateIndex
CREATE INDEX "ProcedureOrder_status_idx" ON "ProcedureOrder"("status");

-- CreateIndex
CREATE INDEX "ClinicalNote_encounterId_idx" ON "ClinicalNote"("encounterId");

-- CreateIndex
CREATE INDEX "ClinicalNote_patientId_idx" ON "ClinicalNote"("patientId");

-- CreateIndex
CREATE INDEX "ClinicalNote_companyId_idx" ON "ClinicalNote"("companyId");

-- CreateIndex
CREATE INDEX "ClinicalNote_noteType_idx" ON "ClinicalNote"("noteType");

-- CreateIndex
CREATE INDEX "ClinicalNote_createdAt_idx" ON "ClinicalNote"("createdAt");

-- CreateIndex
CREATE INDEX "CareProgram_companyId_idx" ON "CareProgram"("companyId");

-- CreateIndex
CREATE INDEX "CareProgram_programType_idx" ON "CareProgram"("programType");

-- CreateIndex
CREATE INDEX "CareProgram_isActive_idx" ON "CareProgram"("isActive");

-- CreateIndex
CREATE INDEX "CareProgramEnrollment_programId_idx" ON "CareProgramEnrollment"("programId");

-- CreateIndex
CREATE INDEX "CareProgramEnrollment_patientId_idx" ON "CareProgramEnrollment"("patientId");

-- CreateIndex
CREATE INDEX "CareProgramEnrollment_companyId_idx" ON "CareProgramEnrollment"("companyId");

-- CreateIndex
CREATE INDEX "CareProgramEnrollment_status_idx" ON "CareProgramEnrollment"("status");

-- CreateIndex
CREATE INDEX "CareProgramVisit_enrollmentId_idx" ON "CareProgramVisit"("enrollmentId");

-- CreateIndex
CREATE INDEX "CareProgramVisit_encounterId_idx" ON "CareProgramVisit"("encounterId");

-- CreateIndex
CREATE INDEX "CareProgramVisit_patientId_idx" ON "CareProgramVisit"("patientId");

-- CreateIndex
CREATE INDEX "CareProgramVisit_companyId_idx" ON "CareProgramVisit"("companyId");

-- CreateIndex
CREATE INDEX "CareProgramVisit_visitDate_idx" ON "CareProgramVisit"("visitDate");

-- CreateIndex
CREATE INDEX "LabTest_companyId_idx" ON "LabTest"("companyId");

-- CreateIndex
CREATE INDEX "LabTest_category_idx" ON "LabTest"("category");

-- CreateIndex
CREATE INDEX "LabTest_testType_idx" ON "LabTest"("testType");

-- CreateIndex
CREATE INDEX "LabTest_isActive_idx" ON "LabTest"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LabTest_companyId_testCode_key" ON "LabTest"("companyId", "testCode");

-- CreateIndex
CREATE INDEX "LabResult_labOrderId_idx" ON "LabResult"("labOrderId");

-- CreateIndex
CREATE INDEX "LabResult_patientId_idx" ON "LabResult"("patientId");

-- CreateIndex
CREATE INDEX "LabResult_companyId_idx" ON "LabResult"("companyId");

-- CreateIndex
CREATE INDEX "LabResult_resultDate_idx" ON "LabResult"("resultDate");

-- CreateIndex
CREATE INDEX "LabQualityControl_companyId_idx" ON "LabQualityControl"("companyId");

-- CreateIndex
CREATE INDEX "LabQualityControl_testDate_idx" ON "LabQualityControl"("testDate");

-- CreateIndex
CREATE INDEX "LabQualityControl_result_idx" ON "LabQualityControl"("result");

-- CreateIndex
CREATE INDEX "LabTurnaroundStats_companyId_idx" ON "LabTurnaroundStats"("companyId");

-- CreateIndex
CREATE INDEX "LabTurnaroundStats_testId_idx" ON "LabTurnaroundStats"("testId");

-- CreateIndex
CREATE INDEX "LabTurnaroundStats_orderDate_idx" ON "LabTurnaroundStats"("orderDate");

-- CreateIndex
CREATE INDEX "Encounter_companyId_idx" ON "Encounter"("companyId");

-- CreateIndex
CREATE INDEX "Encounter_visitType_idx" ON "Encounter"("visitType");

-- CreateIndex
CREATE INDEX "Encounter_visitNumber_idx" ON "Encounter"("visitNumber");

-- CreateIndex
CREATE INDEX "LabOrder_companyId_idx" ON "LabOrder"("companyId");

-- CreateIndex
CREATE INDEX "LabOrder_status_idx" ON "LabOrder"("status");

-- CreateIndex
CREATE INDEX "LabOrder_orderNumber_idx" ON "LabOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "LabOrder_orderedAt_idx" ON "LabOrder"("orderedAt");

-- CreateIndex
CREATE INDEX "Prescription_companyId_idx" ON "Prescription"("companyId");

-- CreateIndex
CREATE INDEX "Prescription_prescriptionNumber_idx" ON "Prescription"("prescriptionNumber");

-- CreateIndex
CREATE INDEX "Prescription_prescribedAt_idx" ON "Prescription"("prescribedAt");

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Triage" ADD CONSTRAINT "Triage_capturedBy_fkey" FOREIGN KEY ("capturedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_consultedBy_fkey" FOREIGN KEY ("consultedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_diagnosedBy_fkey" FOREIGN KEY ("diagnosedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescribedBy_fkey" FOREIGN KEY ("prescribedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_dispensedBy_fkey" FOREIGN KEY ("dispensedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_orderedBy_fkey" FOREIGN KEY ("orderedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_sampleCollectedBy_fkey" FOREIGN KEY ("sampleCollectedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_testId_fkey" FOREIGN KEY ("testId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingOrder" ADD CONSTRAINT "ImagingOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingOrder" ADD CONSTRAINT "ImagingOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingOrder" ADD CONSTRAINT "ImagingOrder_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingOrder" ADD CONSTRAINT "ImagingOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingOrder" ADD CONSTRAINT "ImagingOrder_orderedBy_fkey" FOREIGN KEY ("orderedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingOrder" ADD CONSTRAINT "ImagingOrder_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureOrder" ADD CONSTRAINT "ProcedureOrder_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureOrder" ADD CONSTRAINT "ProcedureOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureOrder" ADD CONSTRAINT "ProcedureOrder_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureOrder" ADD CONSTRAINT "ProcedureOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureOrder" ADD CONSTRAINT "ProcedureOrder_orderedBy_fkey" FOREIGN KEY ("orderedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedureOrder" ADD CONSTRAINT "ProcedureOrder_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgram" ADD CONSTRAINT "CareProgram_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgram" ADD CONSTRAINT "CareProgram_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramEnrollment" ADD CONSTRAINT "CareProgramEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "CareProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramEnrollment" ADD CONSTRAINT "CareProgramEnrollment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramEnrollment" ADD CONSTRAINT "CareProgramEnrollment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramEnrollment" ADD CONSTRAINT "CareProgramEnrollment_enrolledBy_fkey" FOREIGN KEY ("enrolledBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramVisit" ADD CONSTRAINT "CareProgramVisit_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CareProgramEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramVisit" ADD CONSTRAINT "CareProgramVisit_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramVisit" ADD CONSTRAINT "CareProgramVisit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramVisit" ADD CONSTRAINT "CareProgramVisit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareProgramVisit" ADD CONSTRAINT "CareProgramVisit_conductedBy_fkey" FOREIGN KEY ("conductedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_enteredBy_fkey" FOREIGN KEY ("enteredBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabQualityControl" ADD CONSTRAINT "LabQualityControl_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabQualityControl" ADD CONSTRAINT "LabQualityControl_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabQualityControl" ADD CONSTRAINT "LabQualityControl_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTurnaroundStats" ADD CONSTRAINT "LabTurnaroundStats_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
