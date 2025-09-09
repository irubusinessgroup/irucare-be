/*
  Warnings:

  - The values [PLANNED] on the enum `DeliveryItemStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [PLANNED] on the enum `DeliveryStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryItemStatus_new" AS ENUM ('PENDING', 'DISPATCHED', 'DELIVERED', 'DAMAGED', 'REJECTED', 'CANCELLED');
ALTER TABLE "DeliveryItem" ALTER COLUMN "itemStatus" DROP DEFAULT;
ALTER TABLE "DeliveryItem" ALTER COLUMN "itemStatus" TYPE "DeliveryItemStatus_new" USING ("itemStatus"::text::"DeliveryItemStatus_new");
ALTER TYPE "DeliveryItemStatus" RENAME TO "DeliveryItemStatus_old";
ALTER TYPE "DeliveryItemStatus_new" RENAME TO "DeliveryItemStatus";
DROP TYPE "DeliveryItemStatus_old";
ALTER TABLE "DeliveryItem" ALTER COLUMN "itemStatus" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "DeliveryStatus_new" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'PARTIALLY_DELIVERED');
ALTER TABLE "Delivery" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Delivery" ALTER COLUMN "status" TYPE "DeliveryStatus_new" USING ("status"::text::"DeliveryStatus_new");
ALTER TABLE "DeliveryTracking" ALTER COLUMN "status" TYPE "DeliveryStatus_new" USING ("status"::text::"DeliveryStatus_new");
ALTER TYPE "DeliveryStatus" RENAME TO "DeliveryStatus_old";
ALTER TYPE "DeliveryStatus_new" RENAME TO "DeliveryStatus";
DROP TYPE "DeliveryStatus_old";
ALTER TABLE "Delivery" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Delivery" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "DeliveryItem" ALTER COLUMN "itemStatus" SET DEFAULT 'PENDING';
