import { prisma } from "../utils/client";
import { EbmService } from "./EbmService";
import { NotificationService } from "./NotificationService";
import { EbmNotice, EbmNoticesResponse } from "../utils/interfaces/ebm";
import { Server as SocketIOServer } from "socket.io";

export class EbmNoticeService {
  /**
   * Sync EBM notices for a company and broadcast to users
   */
  public static async syncNotices(
    companyId: string,
    io: SocketIOServer,
  ): Promise<void> {
    try {
      // Get company details
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { TIN: true, name: true },
      });

      if (!company?.TIN) {
        console.error(`Company ${companyId} has no TIN configured`);
        return;
      }

      // Get last sync date
      const lastSyncDate = await this.getLastSyncDate(companyId);
      const lastReqDt = this.formatEbmDate(lastSyncDate);

      // Fetch notices from EBM
      const response = (await EbmService.fetchNotices(
        company.TIN,
        "00", // Default branch
        lastReqDt,
      )) as EbmNoticesResponse;

      if (response.resultCd !== "000" || !response.data?.noticeList) {
        console.log(
          `No new notices for ${company.name}: ${response.resultMsg}`,
        );
        return;
      }

      const notices = response.data.noticeList;
      let processedCount = 0;

      // Process each notice
      for (const notice of notices) {
        const alreadyProcessed = await this.isNoticeProcessed(
          companyId,
          notice.noticeNo,
        );

        if (alreadyProcessed) {
          console.log(
            `Notice #${notice.noticeNo} already processed for ${company.name}`,
          );
          continue;
        }

        // Distribute to all company users
        await this.distributeNoticeToUsers(companyId, notice, io);
        processedCount++;
      }

      console.log(
        `✓ Processed ${processedCount} new notices for ${company.name}`,
      );
    } catch (error) {
      console.error(`Error syncing notices for company ${companyId}:`, error);
      throw error;
    }
  }

  /**
   * Get last sync date from most recent notification
   */
  private static async getLastSyncDate(companyId: string): Promise<Date> {
    const lastNotification = await prisma.notification.findFirst({
      where: {
        entityType: "EBM_NOTICE",
        metadata: {
          path: ["companyId"],
          equals: companyId,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (lastNotification && lastNotification.metadata) {
      const metadata = lastNotification.metadata as any;
      if (metadata.regDt) {
        // Parse EBM date format: yyyyMMddhhmmss
        const regDt = metadata.regDt.toString();
        const year = parseInt(regDt.substring(0, 4));
        const month = parseInt(regDt.substring(4, 6)) - 1;
        const day = parseInt(regDt.substring(6, 8));
        const hour = parseInt(regDt.substring(8, 10));
        const minute = parseInt(regDt.substring(10, 12));
        const second = parseInt(regDt.substring(12, 14));
        return new Date(year, month, day, hour, minute, second);
      }
    }

    // Default to 30 days ago for first sync
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return thirtyDaysAgo;
  }

  /**
   * Format date for EBM API: yyyyMMddhhmmss
   */
  private static formatEbmDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}${hour}${minute}${second}`;
  }

  /**
   * Check if notice already processed (duplicate prevention)
   */
  private static async isNoticeProcessed(
    companyId: string,
    noticeNo: number,
  ): Promise<boolean> {
    const existing = await prisma.notification.findFirst({
      where: {
        entityType: "EBM_NOTICE",
        entityId: noticeNo.toString(),
        metadata: {
          path: ["companyId"],
          equals: companyId,
        },
      },
    });

    return existing !== null;
  }

  /**
   * Distribute notice to all company users + real-time broadcast
   */
  private static async distributeNoticeToUsers(
    companyId: string,
    notice: EbmNotice,
    io: SocketIOServer,
  ): Promise<void> {
    // Get all active company users
    const companyUsers = await prisma.companyUser.findMany({
      where: { companyId, isActive: true },
      include: { user: true },
    });

    if (companyUsers.length === 0) {
      console.log(`No active users found for company ${companyId}`);
      return;
    }

    // Create notifications for all users
    for (const cu of companyUsers) {
      try {
        const notification = await NotificationService.createNotification(
          cu.userId,
          notice.title,
          notice.cont,
          "warning", // EBM notices are typically important
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

        // 🔥 REAL-TIME: Broadcast to user's socket
        io.to(cu.userId).emit("notification", notification);
      } catch (error) {
        console.error(
          `Failed to create notification for user ${cu.userId}:`,
          error,
        );
      }
    }

    console.log(
      `📢 Distributed notice #${notice.noticeNo} to ${companyUsers.length} users`,
    );
  }
}
