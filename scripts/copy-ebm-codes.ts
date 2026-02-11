import { PrismaClient } from "@prisma/client";

/**
 * Script to copy EbmCodeClass and EbmCodeDetail data from local to remote database
 */

const localDbUrl = "postgresql://postgres:happi123@localhost:5432/irucare-db";
const remoteDbUrl =
  "postgresql://postgres:PJeJArFpoXmIZFVMUOPVzdcggfckURoP@trolley.proxy.rlwy.net:22423/railway";

async function copyEbmCodes() {
  // Initialize Prisma clients
  const localPrisma = new PrismaClient({
    datasources: {
      db: {
        url: localDbUrl,
      },
    },
  });

  const remotePrisma = new PrismaClient({
    datasources: {
      db: {
        url: remoteDbUrl,
      },
    },
  });

  try {
    console.log("🔄 Starting EBM codes migration...");
    console.log(`📍 Source: Local database`);
    console.log(`📍 Target: Remote database`);

    // 1. Fetch all EbmCodeClass from local database
    console.log("\n📥 Fetching EbmCodeClass from local database...");
    const codeClasses = await localPrisma.ebmCodeClass.findMany({
      include: {
        details: true,
      },
    });

    console.log(`✓ Found ${codeClasses.length} code classes`);

    if (codeClasses.length === 0) {
      console.log("⚠️  No code classes found in local database");
      return;
    }

    // 2. Clear existing data in remote database (optional - comment out if you want to keep existing data)
    console.log("\n🗑️  Clearing existing EBM codes from remote database...");
    await remotePrisma.ebmCodeDetail.deleteMany({});
    await remotePrisma.ebmCodeClass.deleteMany({});
    console.log("✓ Cleared existing data");

    // 3. Copy data to remote database
    console.log(
      "\n📤 Copying EbmCodeClass and EbmCodeDetail to remote database...",
    );

    let totalDetails = 0;

    for (const codeClass of codeClasses) {
      // Create code class
      const createdClass = await remotePrisma.ebmCodeClass.create({
        data: {
          cdCls: codeClass.cdCls,
          cdClsNm: codeClass.cdClsNm,
          cdClsDesc: codeClass.cdClsDesc,
          useYn: codeClass.useYn,
        },
      });

      console.log(`✓ Created code class: ${codeClass.cdCls}`);

      // Create code details for this class
      const details = codeClass.details || [];
      for (const detail of details) {
        await remotePrisma.ebmCodeDetail.create({
          data: {
            codeClassId: createdClass.id,
            cd: detail.cd,
            cdNm: detail.cdNm,
            cdDesc: detail.cdDesc,
            useYn: detail.useYn,
            srtOrd: detail.srtOrd,
          },
        });
        totalDetails++;
      }

      console.log(`  └─ Added ${details.length} code details`);
    }

    console.log("\n✅ Migration completed successfully!");
    console.log(`📊 Summary:`);
    console.log(`  - Code Classes: ${codeClasses.length}`);
    console.log(`  - Code Details: ${totalDetails}`);
  } catch (error) {
    console.error("❌ Error during migration:", error);
    throw error;
  } finally {
    // Close Prisma connections
    await localPrisma.$disconnect();
    await remotePrisma.$disconnect();
  }
}

// Run the script
copyEbmCodes()
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
