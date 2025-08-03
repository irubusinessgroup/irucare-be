/*
  Warnings:

  - Added the required column `companyId` to the `DrugsCategories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DrugsCategories" ADD COLUMN     "companyId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "DrugsCategories" ADD CONSTRAINT "DrugsCategories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
