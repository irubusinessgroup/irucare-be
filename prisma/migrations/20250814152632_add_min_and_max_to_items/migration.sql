/*
  Warnings:

  - Added the required column `maxLevel` to the `Items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minLevel` to the `Items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Items" ADD COLUMN     "maxLevel" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "minLevel" DECIMAL(10,2) NOT NULL;
