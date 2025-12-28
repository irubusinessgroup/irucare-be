-- AlterTable
ALTER TABLE "Sell" ADD COLUMN     "ebmSynced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "intrlData" TEXT,
ADD COLUMN     "mrcNo" TEXT,
ADD COLUMN     "rcptNo" INTEGER,
ADD COLUMN     "rcptSign" TEXT,
ADD COLUMN     "sdcId" TEXT,
ADD COLUMN     "totRcptNo" INTEGER,
ADD COLUMN     "vsdcRcptPbctDate" TEXT;
