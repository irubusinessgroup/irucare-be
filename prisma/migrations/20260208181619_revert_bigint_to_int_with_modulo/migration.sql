/*
  Warnings:

  - You are about to alter the column `rcptNo` on the `Sell` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to alter the column `totRcptNo` on the `Sell` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to alter the column `invcNo` on the `Sell` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.

*/
-- AlterTable
ALTER TABLE "Sell" ALTER COLUMN "rcptNo" SET DATA TYPE INTEGER,
ALTER COLUMN "totRcptNo" SET DATA TYPE INTEGER,
ALTER COLUMN "invcNo" SET DATA TYPE INTEGER;
