import cron from "node-cron";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../utils/client";
import { EbmNoticeService } from "../services/EbmNoticeService";

/**
 * Start EBM notices cron job to sync notices for all active companies
 * Runs every 6 hours
 */
export function startEbmNoticesCron(io: SocketIOServer): void {
  // Run every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    console.log("🔔 Running EBM notices sync...");

    try {
      // Get all active companies
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, TIN: true, name: true },
      });

      console.log(`Found ${companies.length} active companies to sync`);

      let successCount = 0;
      let errorCount = 0;

      // Sync notices for each company
      for (const company of companies) {
        try {
          await EbmNoticeService.syncNotices(company.id, io);
          successCount++;
        } catch (error) {
          console.error(`✗ Failed to sync notices for ${company.name}:`, error);
          errorCount++;
        }
      }

      console.log(`
🔔 EBM Notices Sync Summary:
  - Companies processed: ${companies.length}
  - Successful: ${successCount}
  - Errors: ${errorCount}
      `);
    } catch (error) {
      console.error("Fatal error during EBM notices sync:", error);
    }
  });

  console.log("📅 EBM notices cron job scheduled (every 6 hours)");
}
