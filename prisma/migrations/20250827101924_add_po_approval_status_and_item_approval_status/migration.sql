-- CreateEnum
CREATE TYPE "POApprovalStatus" AS ENUM ('NOT_YET', 'SOME_APPROVED', 'ALL_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ItemApprovalStatus" AS ENUM ('NOT_ACTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "overallStatus" "POApprovalStatus" NOT NULL DEFAULT 'NOT_YET';

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN     "itemStatus" "ItemApprovalStatus" NOT NULL DEFAULT 'NOT_ACTED';
