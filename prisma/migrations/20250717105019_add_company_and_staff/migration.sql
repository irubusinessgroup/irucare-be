/*
  Warnings:

  - You are about to drop the column `address` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `occupation` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `registrationDate` on the `Company` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `CompanyUser` table. All the data in the column will be lost.
  - You are about to drop the column `district` on the `CompanyUser` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumber` on the `CompanyUser` table. All the data in the column will be lost.
  - You are about to drop the column `province` on the `CompanyUser` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `CompanyUser` table. All the data in the column will be lost.
  - You are about to drop the column `sector` on the `CompanyUser` table. All the data in the column will be lost.
  - You are about to drop the `UserRoles` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `country` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `district` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `province` to the `Company` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sector` to the `Company` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('ADMIN', 'AGENT', 'COMPANY_ADMIN', 'COMPANY_USER', 'DEVELOPER', 'ADMINISTRATOR', 'MANAGER', 'STAFF', 'CLIENT');

-- DropForeignKey
ALTER TABLE "UserRoles" DROP CONSTRAINT "UserRoles_userId_fkey";

-- DropIndex
DROP INDEX "CompanyUser_phoneNumber_key";

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "address",
DROP COLUMN "occupation",
DROP COLUMN "registrationDate",
ADD COLUMN     "country" TEXT NOT NULL,
ADD COLUMN     "district" TEXT NOT NULL,
ADD COLUMN     "province" TEXT NOT NULL,
ADD COLUMN     "sector" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "CompanyUser" DROP COLUMN "country",
DROP COLUMN "district",
DROP COLUMN "phoneNumber",
DROP COLUMN "province",
DROP COLUMN "role",
DROP COLUMN "sector";

-- DropTable
DROP TABLE "UserRoles";

-- DropEnum
DROP TYPE "Role";

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" "RoleType" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
