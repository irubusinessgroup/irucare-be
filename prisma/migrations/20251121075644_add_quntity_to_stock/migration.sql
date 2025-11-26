/*
  Warnings:

  - Added the required column `quantity` to the `Stock` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantityAvailable` to the `Stock` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Add columns with default value first
ALTER TABLE "Stock" ADD COLUMN IF NOT EXISTS "quantity" DECIMAL(18,2) DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS "quantityAvailable" DECIMAL(18,2) DEFAULT 0 NOT NULL;

-- Remove the default constraint after data is populated
ALTER TABLE "Stock" ALTER COLUMN "quantity" DROP DEFAULT,
ALTER COLUMN "quantityAvailable" DROP DEFAULT;
