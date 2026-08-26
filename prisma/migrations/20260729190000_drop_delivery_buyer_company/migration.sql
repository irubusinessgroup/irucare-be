-- Sale-invoice deliveries use Sell.client for recipient info; buyer company was B2B leftover.
ALTER TABLE "Delivery" DROP CONSTRAINT IF EXISTS "Delivery_buyerCompanyId_fkey";
ALTER TABLE "Delivery" DROP COLUMN IF EXISTS "buyerCompanyId";
