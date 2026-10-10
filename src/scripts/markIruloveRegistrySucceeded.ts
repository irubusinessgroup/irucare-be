/**
 * One-time: mark IRULOVE Paypack registry rows as SUCCEEDED in IRU Care DB.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx ts-node src/scripts/markIruloveRegistrySucceeded.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REFS = [
  "53076774-7e5c-4b71-9346-e8868221a010",
  "8ec4a9cc-f615-4d0b-886e-b414af171471",
  "d0512f82-eae8-4984-8845-c2b5bd8e75dc",
  "8829bb5e-94eb-4a13-8d97-035da5ebfff5",
];

const EXTERNAL_IDS = [
  "cmtmwpco7035v13p33u2lqnnc",
  "cmtlozsv902do13p3phr79tbo",
  "cmtlnedr702d113p34l1hup8n",
  "cmtk9zbxe01uw13p3h7cu9yep",
];

type Row = {
  refId: string;
  externalId: string | null;
  source: string;
  status: string | null;
  phone: string | null;
};

async function main() {
  const before = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT "refId", "externalId", source, status, phone
     FROM paypack_tx_registry
     WHERE "refId" = ANY($1::text[])
        OR "externalId" = ANY($2::text[])`,
    REFS,
    EXTERNAL_IDS,
  );

  console.log(`Found ${before.length} row(s):`);
  for (const r of before) {
    console.log(
      `  ${r.refId} | ext=${r.externalId} | ${r.source} | status=${r.status} | phone=${r.phone}`,
    );
  }

  if (!before.length) {
    console.error("No matching rows");
    process.exitCode = 1;
    return;
  }

  const updated = await prisma.$executeRawUnsafe(
    `UPDATE paypack_tx_registry
     SET status = 'SUCCEEDED', "updatedAt" = NOW()
     WHERE "refId" = ANY($1::text[])
        OR "externalId" = ANY($2::text[])`,
    REFS,
    EXTERNAL_IDS,
  );
  console.log(`\nUpdated ${updated} → SUCCEEDED`);

  const after = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT "refId", "externalId", source, status, phone
     FROM paypack_tx_registry
     WHERE "refId" = ANY($1::text[])
        OR "externalId" = ANY($2::text[])`,
    REFS,
    EXTERNAL_IDS,
  );
  for (const r of after) {
    console.log(`  ✓ ${r.refId} → ${r.status}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
