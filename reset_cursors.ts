import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.ebmSyncCursor.deleteMany();
  console.log(`Deleted ${result.count} EBM Sync Cursors. The application will now refetch from the 2019 seed date!`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
