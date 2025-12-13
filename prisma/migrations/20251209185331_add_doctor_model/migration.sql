-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('PRIVATE', 'INSUREE');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CREDIT', 'HALF_PAID', 'FULL_PAID');

-- AlterTable
ALTER TABLE "Sell" ADD COLUMN     "clientType" "ClientType" DEFAULT 'PRIVATE',
ADD COLUMN     "doctorId" TEXT,
ADD COLUMN     "hospital" TEXT,
ADD COLUMN     "paymentMode" "PaymentMode";

-- CreateTable
CREATE TABLE "Doctor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Doctor_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Sell" ADD CONSTRAINT "Sell_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "Doctor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
