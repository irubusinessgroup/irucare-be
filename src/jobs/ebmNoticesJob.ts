import cron from "node-cron";
import { Server as SocketIOServer } from "socket.io";
import { prisma } from "../utils/client";
import { EbmNoticeService } from "../services/EbmNoticeService";

const CRON_SCHEDULE = "*/1 * * * *"; // every 1 minute

let isSyncRunning = false;

async function syncNoticesForAllCompanies(io: SocketIOServer): Promise<void> {
  if (isSyncRunning) {
    console.log("[EBM Notices Cron] Skipping run — previous sync still in progress");
    return;
  }

  isSyncRunning = true;

  try {
    // Only companies that already initialized EBM on a branch (or cached ebmBhfId).
    // Avoids noisy errors every minute for tenants that have not set up VSDC yet.
    const companies = (
      await prisma.company.findMany({
        where: {
          TIN: { not: "" },
          OR: [
            { branches: { some: { isEbmInitialized: true } } },
            { companyTools: { some: { ebmBhfId: { not: null } } } },
          ],
        },
        select: { id: true, name: true, TIN: true },
      })
    ).filter((c) => Boolean(c.TIN?.trim()));

    if (companies.length === 0) {
      return;
    }

    console.log(
      `[EBM Notices Cron] Syncing ${companies.length} compan${companies.length === 1 ? "y" : "ies"}…`,
    );

    for (const company of companies) {
      try {
        const result = await EbmNoticeService.syncNotices(company.id, io);
        if (result.fetched > 0) {
          console.log(
            `[EBM Notices Cron] ${company.name}: fetched=${result.fetched}, processed=${result.processed}, skipped=${result.skipped}, cursor=${result.lastSyncedAt}`,
          );
        }
      } catch (error) {
        console.error(
          `[EBM Notices Cron] Failed for company ${company.name} (${company.id}):`,
          error,
        );
      }
    }
  } finally {
    isSyncRunning = false;
  }
}

export function startEbmNoticesCron(io: SocketIOServer): void {
  if (process.env.EBM_NOTICES_CRON_ENABLED === "false") {
    console.log("[EBM Notices Cron] Disabled via EBM_NOTICES_CRON_ENABLED=false");
    return;
  }

  cron.schedule(CRON_SCHEDULE, () => {
    void syncNoticesForAllCompanies(io);
  });

  console.log(`[EBM Notices Cron] Scheduled (${CRON_SCHEDULE})`);
}
