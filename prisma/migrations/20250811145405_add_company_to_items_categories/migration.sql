/*
  Warnings:

  - Added the required column `company_id` to the `ItemCategories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ItemCategories" ADD COLUMN     "company_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "ItemCategories" ADD CONSTRAINT "ItemCategories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
