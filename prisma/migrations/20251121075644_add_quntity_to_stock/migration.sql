/*
  Warnings:

  - Added the required column `quantity` to the `Stock` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantityAvailable` to the `Stock` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "quantity" DECIMAL(18,2) NOT NULL,
ADD COLUMN     "quantityAvailable" DECIMAL(18,2) NOT NULL;
