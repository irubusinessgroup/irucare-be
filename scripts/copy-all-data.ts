/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from "@prisma/client";

const localPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.LOCAL_DATABASE_URL || "postgresql://postgres:happi123@localhost:5432/irucare-db",
    },
  },
});

const remotePrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.REMOTE_DATABASE_URL || "postgresql://postgres:PJeJArFpoXmIZFVMUOPVzdcggfckURoP@trolley.proxy.rlwy.net:22423/railway",
    },
  },
});

async function copyDatabase() {
  try {
    console.log("🔄 Starting database copy...\n");

    // Disable foreign key constraints
    await (remotePrisma as any).$executeRawUnsafe("SET session_replication_role = replica");
    console.log("🔓 Foreign key constraints disabled\n");

    // Get all model names from Prisma schema dynamically
    const models = Object.keys(localPrisma).filter(
      (key) =>
        typeof (localPrisma as any)[key] === "object" &&
        (localPrisma as any)[key] !== null &&
        typeof (localPrisma as any)[key].findMany === "function"
    );

    let totalCopied = 0;

    for (const model of models) {
      try {
        const records = await (localPrisma as any)[model].findMany();

        if (records.length === 0) {
          console.log(`✓ ${model}: 0 records`);
          continue;
        }

        const result = await (remotePrisma as any)[model].createMany({
          data: records,
          skipDuplicates: true,
        });

        console.log(`✓ ${model}: ${result.count}/${records.length} records`);
        totalCopied += result.count;
      } catch (error: any) {
        console.log(`⚠ ${model}: ${error.message}`);
      }
    }

    // Re-enable foreign key constraints
    await (remotePrisma as any).$executeRawUnsafe("SET session_replication_role = origin");
    console.log("\n🔒 Foreign key constraints re-enabled");

    console.log(`\n✅ Done! Copied ${totalCopied} total records\n`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await localPrisma.$disconnect();
    await remotePrisma.$disconnect();
  }
}

copyDatabase()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
