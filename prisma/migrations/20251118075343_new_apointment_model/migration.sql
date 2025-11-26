/*
  Warnings:

  - You are about to drop the column `reminderSettings` on the `Appointment` table. All the data in the column will be lost.
  - You are about to drop the `AppointmentNotification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AppointmentReminder` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AppointmentTimeSlot` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProviderAvailability` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'TRANSFERRED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "AppointmentNotification" DROP CONSTRAINT "AppointmentNotification_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentNotification" DROP CONSTRAINT "AppointmentNotification_userId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentReminder" DROP CONSTRAINT "AppointmentReminder_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentTimeSlot" DROP CONSTRAINT "AppointmentTimeSlot_companyId_fkey";

-- DropForeignKey
ALTER TABLE "AppointmentTimeSlot" DROP CONSTRAINT "AppointmentTimeSlot_providerId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderAvailability" DROP CONSTRAINT "ProviderAvailability_companyId_fkey";

-- DropForeignKey
ALTER TABLE "ProviderAvailability" DROP CONSTRAINT "ProviderAvailability_providerId_fkey";

-- AlterTable
ALTER TABLE "Appointment" DROP COLUMN "reminderSettings",
ADD COLUMN     "calledAt" TIMESTAMP(3),
ADD COLUMN     "checkInTime" TIMESTAMP(3),
ADD COLUMN     "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "queueNumber" INTEGER,
ADD COLUMN     "queueStatus" "QueueStatus",
ADD COLUMN     "transferredTo" TEXT;

-- DropTable
DROP TABLE "AppointmentNotification";

-- DropTable
DROP TABLE "AppointmentReminder";

-- DropTable
DROP TABLE "AppointmentTimeSlot";

-- DropTable
DROP TABLE "ProviderAvailability";

-- DropEnum
DROP TYPE "AppointmentNotificationType";

-- CreateIndex
CREATE INDEX "Appointment_queueStatus_idx" ON "Appointment"("queueStatus");

-- CreateIndex
CREATE INDEX "Appointment_isWalkIn_idx" ON "Appointment"("isWalkIn");
