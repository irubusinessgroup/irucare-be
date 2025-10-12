/*
  Warnings:

  - You are about to drop the column `barcodeQrCode` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `batchLotNumber` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `brandManufacturer` on the `Items` table. All the data in the column will be lost.
  - You are about to drop the column `serialNumber` on the `Items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Items" DROP COLUMN "barcodeQrCode",
DROP COLUMN "batchLotNumber",
DROP COLUMN "brandManufacturer",
DROP COLUMN "serialNumber";
