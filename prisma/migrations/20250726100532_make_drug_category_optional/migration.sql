-- DropForeignKey
ALTER TABLE "Drugs" DROP CONSTRAINT "Drugs_drugCategoryId_fkey";

-- AlterTable
ALTER TABLE "Drugs" ALTER COLUMN "drugCategoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Drugs" ADD CONSTRAINT "Drugs_drugCategoryId_fkey" FOREIGN KEY ("drugCategoryId") REFERENCES "DrugsCategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
