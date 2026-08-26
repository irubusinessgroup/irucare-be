/**
 * Backfill PaypackTxRegistry from existing IRUCARE Payment rows.
 *
 * Usage:
 *   pnpm ts-node src/scripts/backfillPaypackTxRegistry.ts
 *   npm run backfill:paypack-registry
 */
import dotenv from "dotenv";
dotenv.config();

import { prisma } from "../utils/client";

async function main() {
  console.log("[backfill] Loading IRUCARE payments with refId…");

  const payments = await prisma.payment.findMany({
    where: {
      refId: { not: null },
    },
    select: {
      id: true,
      refId: true,
      amount: true,
      accountNumber: true,
      status: true,
      kind: true,
      subscriptionId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const withRef = payments.filter((p) => !!p.refId?.trim());
  console.log(`[backfill] Found ${withRef.length} payments to upsert`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of withRef) {
    const refId = String(p.refId).trim();
    try {
      const existing = await prisma.paypackTxRegistry.findUnique({
        where: { refId },
        select: { id: true, source: true },
      });

      await prisma.paypackTxRegistry.upsert({
        where: { refId },
        create: {
          refId,
          source: "IRUCARE",
          externalId: p.id,
          amountRwf: p.amount,
          phone: p.accountNumber
            ? String(p.accountNumber).replace(/\D/g, "").slice(-10)
            : null,
          status: p.status,
          kind: p.kind,
          metadata: {
            subscriptionId: p.subscriptionId,
            backfilled: true,
            paymentCreatedAt: p.createdAt.toISOString(),
          },
          reportedAt: p.createdAt,
        },
        update: {
          // Do not overwrite a different product's claim
          ...(existing && existing.source !== "IRUCARE"
            ? {}
            : {
                source: "IRUCARE",
                externalId: p.id,
                amountRwf: p.amount,
                phone: p.accountNumber
                  ? String(p.accountNumber).replace(/\D/g, "").slice(-10)
                  : null,
                status: p.status,
                kind: p.kind,
                metadata: {
                  subscriptionId: p.subscriptionId,
                  backfilled: true,
                  paymentCreatedAt: p.createdAt.toISOString(),
                },
              }),
        },
      });

      if (!existing) created++;
      else if (existing.source === "IRUCARE") updated++;
      else {
        skipped++;
        console.warn(
          `[backfill] Skip overwrite ref=${refId} (owned by ${existing.source})`,
        );
      }
    } catch (err) {
      errors++;
      console.error(
        `[backfill] Failed ref=${refId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log("[backfill] Done:", {
    total: withRef.length,
    created,
    updated,
    skipped,
    errors,
  });
}

main()
  .catch((e) => {
    console.error("[backfill] Fatal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
