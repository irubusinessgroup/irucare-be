import axios from "axios";
import { prisma } from "../utils/client";

export class EbmCodeSyncService {
  /**
   * Ensure codes are synced for a company
   * Returns immediately if already synced
   * Fetches and saves if not synced
   */
  static async ensureCodesSynced(companyId: string): Promise<void> {
    // Check if already synced
    const syncStatus = await prisma.ebmCodeSyncStatus.findUnique({
      where: { companyId },
    });

    if (syncStatus?.syncStatus === "SUCCESS") {
      console.log(`✓ EBM codes already synced for company ${companyId}`);
      return;
    }

    // Fetch and sync
    console.log(`↻ Fetching EBM codes for company ${companyId}...`);
    await this.syncCodes(companyId);
  }

  /**
   * Fetch codes from EBM API and save to DB
   */
  private static async syncCodes(companyId: string): Promise<void> {
    try {
      // Get company TIN
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { TIN: true },
      });

      if (!company?.TIN) {
        throw new Error("Company TIN not configured");
      }

      const tin = company.TIN;
      const bhfId = "00"; // Default branch for now

      // Fetch from EBM using axios directly
      const ebmBaseUrl = process.env.EBM_API_BASE_URL;
      const response = await axios.post(`${ebmBaseUrl}/code/selectCodes`, {
        tin,
        bhfId,
        lastReqDt: "20200101000000", // Historical date for initial sync
      });

      console.log("EBM API Response:", JSON.stringify(response.data, null, 2));

      // Validate response structure
      if (!response.data) {
        throw new Error("EBM API returned empty response");
      }

      if (!response.data.data) {
        throw new Error(
          `EBM API error: ${response.data.resultMsg || "Unknown error"}`,
        );
      }

      if (
        !response.data.data.clsList ||
        !Array.isArray(response.data.data.clsList)
      ) {
        throw new Error("EBM API response missing clsList array");
      }

      const REQUIRED_CLASSES = ["05", "24", "17", "10"];
      const clsList = response.data.data.clsList.filter((cls: any) =>
        REQUIRED_CLASSES.includes(cls.cdCls),
      );

      // Save to database with transaction
      const result = await this.saveCodesToDB(clsList);

      // Mark as synced
      await prisma.ebmCodeSyncStatus.upsert({
        where: { companyId },
        update: {
          syncStatus: "SUCCESS",
          lastSyncAt: new Date(),
          totalCodesSynced: result.totalCodes,
          errorMessage: null,
        },
        create: {
          companyId,
          syncStatus: "SUCCESS",
          lastSyncAt: new Date(),
          totalCodesSynced: result.totalCodes,
        },
      });

      console.log(`✓ Synced ${result.totalCodes} EBM codes successfully`);
    } catch (error: any) {
      console.error("✗ EBM code sync failed:", error);

      // Mark as failed
      await prisma.ebmCodeSyncStatus.upsert({
        where: { companyId },
        update: {
          syncStatus: "FAILED",
          errorMessage: error.message,
        },
        create: {
          companyId,
          syncStatus: "FAILED",
          errorMessage: error.message,
        },
      });

      throw error; // Re-throw to inform caller
    }
  }

  /**
   * Save codes to database with transaction
   */
  private static async saveCodesToDB(clsList: any[]) {
    return await prisma.$transaction(async (tx) => {
      let totalCodes = 0;

      for (const cls of clsList) {
        // Upsert code class
        const codeClass = await tx.ebmCodeClass.upsert({
          where: { cdCls: cls.cdCls },
          update: {
            cdClsNm: cls.cdClsNm,
            cdClsDesc: cls.cdClsDesc,
            useYn: cls.useYn,
          },
          create: {
            cdCls: cls.cdCls,
            cdClsNm: cls.cdClsNm,
            cdClsDesc: cls.cdClsDesc,
            useYn: cls.useYn,
          },
        });

        // Upsert each code detail
        for (const detail of cls.dtlList) {
          await tx.ebmCodeDetail.upsert({
            where: {
              codeClassId_cd: {
                codeClassId: codeClass.id,
                cd: detail.cd,
              },
            },
            update: {
              cdNm: detail.cdNm,
              cdDesc: detail.cdDesc,
              useYn: detail.useYn,
              srtOrd: detail.srtOrd,
            },
            create: {
              codeClassId: codeClass.id,
              cd: detail.cd,
              cdNm: detail.cdNm,
              cdDesc: detail.cdDesc,
              useYn: detail.useYn,
              srtOrd: detail.srtOrd,
            },
          });
          totalCodes++;
        }
      }

      return { classCount: clsList.length, totalCodes };
    });
  }

  /**
   * Manual re-sync (for admin use)
   */
  static async forceSyncCodes(companyId: string): Promise<void> {
    console.log(`↻ Force syncing EBM codes for company ${companyId}...`);
    await this.syncCodes(companyId);
  }
}
