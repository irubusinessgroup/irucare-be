/*
  Warnings:

  - You are about to drop the column `sellingPercentage` on the `CompanyTools` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CompanyTools" DROP COLUMN "sellingPercentage",
ADD COLUMN     "markupPrice" INTEGER;
