/*
  Warnings:

  - You are about to drop the `Ads` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AgentReview` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Agents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EnquiryProperty` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Reviews` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Testimony` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AgentReview" DROP CONSTRAINT "AgentReview_agentId_fkey";

-- DropForeignKey
ALTER TABLE "Agents" DROP CONSTRAINT "Agents_userId_fkey";

-- DropForeignKey
ALTER TABLE "EnquiryProperty" DROP CONSTRAINT "EnquiryProperty_agentId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "Reviews" DROP CONSTRAINT "Reviews_productId_fkey";

-- DropForeignKey
ALTER TABLE "Testimony" DROP CONSTRAINT "Testimony_agentReviewId_fkey";

-- DropForeignKey
ALTER TABLE "Testimony" DROP CONSTRAINT "Testimony_reviewsId_fkey";

-- DropForeignKey
ALTER TABLE "Testimony" DROP CONSTRAINT "Testimony_userId_fkey";

-- DropTable
DROP TABLE "Ads";

-- DropTable
DROP TABLE "AgentReview";

-- DropTable
DROP TABLE "Agents";

-- DropTable
DROP TABLE "EnquiryProperty";

-- DropTable
DROP TABLE "Order";

-- DropTable
DROP TABLE "OrderItem";

-- DropTable
DROP TABLE "Product";

-- DropTable
DROP TABLE "Reviews";

-- DropTable
DROP TABLE "Testimony";

-- DropEnum
DROP TYPE "ProductCategory";
