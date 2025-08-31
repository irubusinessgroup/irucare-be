-- AlterTable
ALTER TABLE "Approvals" ADD COLUMN     "ExpectedSellPrice" DECIMAL(18,2),
ALTER COLUMN "approvalStatus" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Stock" ALTER COLUMN "status" SET DEFAULT 'PENDING';
