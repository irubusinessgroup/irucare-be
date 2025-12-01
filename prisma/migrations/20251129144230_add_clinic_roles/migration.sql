-- CreateEnum
CREATE TYPE "ClinicRole" AS ENUM ('CLINIC_ADMIN', 'RECEPTIONIST', 'NURSE', 'DOCTOR', 'LAB_TECH', 'PHARMACIST', 'ACCOUNTANT');

-- CreateTable
CREATE TABLE "ClinicUserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClinicRole" NOT NULL,

    CONSTRAINT "ClinicUserRole_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClinicUserRole" ADD CONSTRAINT "ClinicUserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
