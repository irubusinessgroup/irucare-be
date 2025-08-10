/*
  Warnings:

  - You are about to drop the column `enquiryPropertyId` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `location` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumber` on the `Contact` table. All the data in the column will be lost.
  - You are about to drop the column `photo` on the `Contact` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_enquiryPropertyId_fkey";

-- AlterTable
ALTER TABLE "Contact" DROP COLUMN "enquiryPropertyId",
DROP COLUMN "location",
DROP COLUMN "phoneNumber",
DROP COLUMN "photo",
ADD COLUMN     "company" TEXT;
