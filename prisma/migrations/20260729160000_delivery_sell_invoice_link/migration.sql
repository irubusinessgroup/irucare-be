-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "sellId" TEXT;
ALTER TABLE "Delivery" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Delivery_sellId_idx" ON "Delivery"("sellId");
CREATE INDEX IF NOT EXISTS "Delivery_invoiceNumber_idx" ON "Delivery"("invoiceNumber");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_sellId_fkey"
    FOREIGN KEY ("sellId") REFERENCES "Sell"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
