import { prisma } from "../utils/client";
import { EbmService } from "./EbmService";
import { NotificationService } from "./NotificationService";
import { EbmNotice, EbmNoticesResponse } from "../utils/interfaces/ebm";
import { Server as SocketIOServer } from "socket.io";

const NOTICE_SYNC_TYPE = "NOTICE";
const SEED_LAST_REQ_DT = "20000101000000";

/** EBM expects yyyyMMddHHmmss — Kigali (UTC+2) to match other EBM sync cursors. */
function kigaliNow(): string {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

export interface SyncNoticesOptions {
  /** When true, request from 2000-01-01 (admin full re-pull). Cursor still advances only if EBM returns notices. */
  fullSync?: boolean;
}

export interface SyncNoticesResult {
  fetched: number;
  processed: number;
  skipped: number;
  /** lastReqDt sent to EBM on this request */
  lastReqDt: string;
  /** Stored cursor after sync (unchanged when EBM returned no notices) */
  lastSyncedAt: string;
  ebmResultMsg?: string;
}

export class EbmNoticeService {
  public static async syncNotices(
    companyId: string,
    io: SocketIOServer,
    options: SyncNoticesOptions = {},
  ): Promise<SyncNoticesResult> {
    const lastReqDt = await this.resolveLastReqDt(companyId, options.fullSync);
    const lastSyncedAtBefore = await this.getStoredLastSyncedAt(companyId);

    const buildResult = (
      partial: Omit<SyncNoticesResult, "lastReqDt" | "lastSyncedAt"> & {
        lastSyncedAt?: string;
      },
    ): SyncNoticesResult => ({
      lastReqDt,
      lastSyncedAt: partial.lastSyncedAt ?? lastSyncedAtBefore,
      fetched: partial.fetched,
      processed: partial.processed,
      skipped: partial.skipped,
      ebmResultMsg: partial.ebmResultMsg,
    });

    try {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { TIN: true, name: true },
      });

      if (!company?.TIN) {
        console.error(`Company ${companyId} has no TIN configured`);
        return buildResult({
          fetched: 0,
          processed: 0,
          skipped: 0,
          ebmResultMsg: "Company TIN not configured",
        });
      }

      const bhfId = await EbmService.getInitializedBhfId(companyId);
      if (!bhfId) {
        return buildResult({
          fetched: 0,
          processed: 0,
          skipped: 0,
          ebmResultMsg: "No EBM-initialized branch",
        });
      }

      const response = (await EbmService.fetchNotices(
        company.TIN,
        bhfId,
        lastReqDt,
      )) as EbmNoticesResponse;

      // 000 = success, 001 = no search result (no new notices — not an error)
      if (response.resultCd !== "000" && response.resultCd !== "001") {
        console.log(
          `EBM notices fetch failed for ${company.name}: [${response.resultCd}] ${response.resultMsg}`,
        );
        return buildResult({
          fetched: 0,
          processed: 0,
          skipped: 0,
          ebmResultMsg: response.resultMsg,
        });
      }

      const notices = response.data?.noticeList ?? [];
      if (notices.length === 0) {
        console.log(
          `No new EBM notices for ${company.name} (lastReqDt=${lastReqDt}, cursor unchanged)`,
        );
        return buildResult({
          fetched: 0,
          processed: 0,
          skipped: 0,
          ebmResultMsg: response.resultMsg,
        });
      }

      let processedCount = 0;
      let skippedCount = 0;

      for (const notice of notices) {
        processedCount += await this.distributeNoticeToUsers(
          companyId,
          notice,
          io,
        );
      }

      const lastSyncedAt = await this.advanceCursor(companyId);

      console.log(
        `✓ EBM notices for ${company.name}: fetched=${notices.length}, processed=${processedCount}, skipped=${skippedCount} | sent lastReqDt=${lastReqDt} → cursor=${lastSyncedAt}`,
      );

      return buildResult({
        fetched: notices.length,
        processed: processedCount,
        skipped: skippedCount,
        lastSyncedAt,
        ebmResultMsg: response.resultMsg,
      });
    } catch (error) {
      console.error(`Error syncing notices for company ${companyId}:`, error);
      throw error;
    }
  }

  public static async pushUserNotificationsToSocket(
    userId: string,
    io: SocketIOServer,
  ): Promise<void> {
    const notifications = await NotificationService.getUserNotifications(userId);
    io.to(userId).emit("notifications", notifications);
  }

  private static async resolveLastReqDt(
    companyId: string,
    fullSync?: boolean,
  ): Promise<string> {
    if (fullSync) {
      return SEED_LAST_REQ_DT;
    }
    return this.getStoredLastSyncedAt(companyId);
  }

  private static async getStoredLastSyncedAt(companyId: string): Promise<string> {
    const cursor = await prisma.ebmSyncCursor.findUnique({
      where: { companyId_type: { companyId, type: NOTICE_SYNC_TYPE } },
    });
    return cursor?.lastSyncedAt ?? SEED_LAST_REQ_DT;
  }

  private static async advanceCursor(companyId: string): Promise<string> {
    const syncedAt = kigaliNow();
    await prisma.ebmSyncCursor.upsert({
      where: { companyId_type: { companyId, type: NOTICE_SYNC_TYPE } },
      create: { companyId, type: NOTICE_SYNC_TYPE, lastSyncedAt: syncedAt },
      update: { lastSyncedAt: syncedAt },
    });
    return syncedAt;
  }

  private static async distributeNoticeToUsers(
    companyId: string,
    notice: EbmNotice,
    io: SocketIOServer,
  ): Promise<number> {
    const companyUsers = await prisma.companyUser.findMany({
      where: { companyId, isActive: true },
      include: { user: true },
    });

    if (companyUsers.length === 0) {
      console.log(`No active users found for company ${companyId}`);
      return 0;
    }

    let created = 0;

    for (const cu of companyUsers) {
      try {
        const notification = await NotificationService.createNotification(
          cu.userId,
          notice.title,
          notice.cont,
          "warning",
          notice.dtlUrl,
          "EBM_NOTICE",
          notice.noticeNo.toString(),
          {
            source: "EBM",
            noticeNo: notice.noticeNo,
            regrNm: notice.regrNm,
            regDt: notice.regDt,
            companyId: companyId,
            processedAt: new Date().toISOString(),
          },
        );

        io.to(cu.userId).emit("notification", notification);
        created++;
      } catch (error) {
        console.error(
          `Failed to create notification for user ${cu.userId}:`,
          error,
        );
      }
    }

    console.log(
      `📢 Notice #${notice.noticeNo}: created ${created} notification(s)`,
    );

    return created;
  }
}
