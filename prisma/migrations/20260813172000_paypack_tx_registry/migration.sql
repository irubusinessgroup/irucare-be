-- Cross-app Paypack transaction ownership registry
CREATE TABLE IF NOT EXISTS "paypack_tx_registry" (
    "id" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "amountRwf" DOUBLE PRECISION,
    "phone" TEXT,
    "status" TEXT,
    "kind" TEXT,
    "metadata" JSONB,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paypack_tx_registry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "paypack_tx_registry_refId_key" ON "paypack_tx_registry"("refId");
CREATE INDEX IF NOT EXISTS "paypack_tx_registry_source_idx" ON "paypack_tx_registry"("source");
