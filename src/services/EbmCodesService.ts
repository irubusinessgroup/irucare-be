import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { EbmCodeSyncService } from "./EbmCodeSyncService";

export interface IEbmCode {
  cd: string;
  cdNm: string;
  cdDesc?: string;
}

export interface IEbmCodeClass {
  cdCls: string;
  cdClsNm: string;
  codes: IEbmCode[];
}

export class EbmCodesService {
  /**
   * Get codes for a specific class from local database
   */
  public static async getCodesByClass(
    companyId: string,
    cdCls: string,
  ): Promise<{ data: IEbmCodeClass }> {
    // Ensure codes are synced first
    // BYPASSED FOR NOW - Allow user to get codes without waiting for EBM sync
    // await EbmCodeSyncService.ensureCodesSynced(companyId);

    const codeClass = await prisma.ebmCodeClass.findUnique({
      where: { cdCls },
      include: {
        details: {
          where: { useYn: "Y" },
          orderBy: { srtOrd: "asc" },
        },
      },
    });

    if (!codeClass) {
      throw new AppError(`Code class ${cdCls} not found`, 404);
    }

    return {
      data: {
        cdCls: codeClass.cdCls,
        cdClsNm: codeClass.cdClsNm,
        codes: codeClass.details.map((d) => ({
          cd: d.cd,
          cdNm: d.cdNm,
          cdDesc: d.cdDesc || undefined,
        })),
      },
    };
  }

  /**
   * Get all required code classes (for initial load in frontend)
   */
  public static async getAllRequiredCodes(companyId: string): Promise<{
    data: IEbmCodeClass[];
  }> {
    // Ensure codes are synced first
    // BYPASSED FOR NOW - Allow user to get codes without waiting for EBM sync
    // await EbmCodeSyncService.ensureCodesSynced(companyId);

    const REQUIRED_CLASSES = ["05", "24", "17", "10"];

    const codeClasses = await prisma.ebmCodeClass.findMany({
      where: {
        cdCls: { in: REQUIRED_CLASSES },
      },
      include: {
        details: {
          where: { useYn: "Y" },
          orderBy: { srtOrd: "asc" },
        },
      },
      orderBy: {
        cdCls: "asc",
      },
    });

    return {
      data: codeClasses.map((cls) => ({
        cdCls: cls.cdCls,
        cdClsNm: cls.cdClsNm,
        codes: cls.details.map((d) => ({
          cd: d.cd,
          cdNm: d.cdNm,
          cdDesc: d.cdDesc || undefined,
        })),
      })),
    };
  }
}
