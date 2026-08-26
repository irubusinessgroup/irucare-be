import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { SellThroughRateService } from "./SellThroughRateService";
import { EbmService } from "./EbmService";

type CompanyToolsRow = {
  id: string;
  companyId: string;
  markupPrice: number | null;
  taxRate: number | null;
  companySignature: string | null;
  companyStamp: string | null;
  bankAccounts: unknown;
  businessTin: string | null;
  ebmDeviceSerialNumber: string | null;
  ebmBhfId: string | null;
  taxReportingFrequency: string | null;
  createdAt: Date;
  updatedAt: Date;
  company?: {
    name: string;
    logo?: string | null;
    website?: string | null;
    TIN?: string | null;
  };
};

export class CompanyToolsService {
  private static ebmInitUserMessage(args: {
    resultCd?: string | null;
    resultMsg?: string | null;
    tin: string;
    bhfId: string;
    dvcSrlNo: string;
  }): string {
    const code = String(args.resultCd ?? "").trim();
    const rawMsg = String(args.resultMsg ?? "").trim();

    // Common happy path / acceptable
    if (code === "000") return "EBM device initialized successfully.";
    if (code === "902")
      return "This device is already installed on EBM. No further action is needed.";

    // Client-side request composition issues (usually actionable by the user)
    if (code === "881") {
      return "Initialization failed because the Purchase Code is required by EBM for this request. Please contact support.";
    }
    if (code === "884") {
      return "Initialization failed because the TIN is invalid. Please double-check the 9-digit Business TIN and try again.";
    }
    if (code === "901") {
      return "Initialization failed because the device is not valid. Please confirm the EBM device serial number and try again.";
    }

    // 896 includes cases like "Request Status ... : 403" (credentials / authorization at EBM side)
    if (code === "896") {
      const has403 = rawMsg.includes("403");
      return has403
        ? `EBM rejected the initialization request (403). Please confirm the Business TIN, Branch ID (${args.bhfId}), and Device Serial Number, then try again.`
        : "EBM rejected the initialization request. Please confirm the Business TIN, Branch ID, and Device Serial Number, then try again.";
    }

    // Generic fallback: keep it friendly but preserve the EBM code
    if (code) {
      return `EBM initialization failed (code ${code}). ${rawMsg || "Please verify the details and try again."}`;
    }

    return rawMsg || "EBM initialization failed. Please verify the details and try again.";
  }

  private static mapCompanyTools(row: CompanyToolsRow) {
    const raw = row?.bankAccounts ?? null;
    const bankAccounts = Array.isArray(raw)
      ? (raw as Array<Record<string, unknown>>).map((a) => ({
          bankName:
            typeof a.bankName === "string" ? (a.bankName as string) : undefined,
          accountNumber:
            typeof a.accountNumber === "string"
              ? (a.accountNumber as string)
              : undefined,
        }))
      : null;
    const companyTin = row.company?.TIN || row.businessTin || null;
    return { ...row, bankAccounts, businessTin: companyTin };
  }

  public static async createCompanyTools(
    data: {
      markupPrice?: number;
      taxRate?: number;
      companySignature?: string;
      companyStamp?: string;
      bankAccounts?: Array<{ bankName?: string; accountNumber?: string }>;
      businessTin?: string;
      taxReportingFrequency?: string;
      ebmDeviceSerialNumber?: string;
    },
    companyId: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new AppError("Company not found", 404);

    // Check if company tools already exist
    const existing = await prisma.companyTools.findFirst({
      where: { companyId },
    });
    if (existing) {
      throw new AppError(
        "Company tools already exist. Please update instead.",
        400,
      );
    }

    // Validate tax reporting frequency
    if (
      data.taxReportingFrequency &&
      !["Monthly", "Quarterly"].includes(data.taxReportingFrequency)
    ) {
      throw new AppError(
        "Tax reporting frequency must be either 'Monthly' or 'Quarterly'",
        400,
      );
    }

    const created = await prisma.companyTools.create({
      data: {
        markupPrice: data.markupPrice || 0,
        taxRate: data.taxRate || 0,
        companySignature: data.companySignature,
        companyStamp: data.companyStamp,
        businessTin: data.businessTin,
        taxReportingFrequency: data.taxReportingFrequency,
        ebmDeviceSerialNumber: data.ebmDeviceSerialNumber,
        ...(Array.isArray(data.bankAccounts)
          ? {
              bankAccounts: data.bankAccounts,
            }
          : {}),
        company: { connect: { id: companyId } },
      },
      include: {
        company: {
          select: { name: true, TIN: true },
        },
      },
    });

    if (data.businessTin) {
      await prisma.company.update({
        where: { id: companyId },
        data: { TIN: data.businessTin },
      });
    }

    return {
      message: "Company tools created successfully",
      data: CompanyToolsService.mapCompanyTools(created),
    };
  }

  public static async getCompanyTools(id: string) {
    const tools = await prisma.companyTools.findUnique({
      where: { id },
      include: {
        company: {
          select: { name: true, TIN: true },
        },
      },
    });
    if (!tools) throw new AppError("Company tools not found", 404);

    return {
      message: "Company tools fetched successfully",
      data: CompanyToolsService.mapCompanyTools(tools),
    };
  }

  public static async getCompanyToolsByCompanyId(companyId: string) {
    const tools = await prisma.companyTools.findFirst({
      where: { companyId },
      include: {
        company: {
          select: { name: true, logo: true, website: true, TIN: true },
        },
      },
    });

    return {
      message: "Company tools fetched successfully",
      data: tools ? CompanyToolsService.mapCompanyTools(tools) : null,
    };
  }

  public static async updateCompanyTools(
    id: string,
    data: {
      markupPrice?: number;
      taxRate?: number;
      companySignature?: string;
      companyStamp?: string;
      bankAccounts?: Array<{ bankName?: string; accountNumber?: string }>;
      businessTin?: string;
      taxReportingFrequency?: string;
      ebmDeviceSerialNumber?: string;
      invoiceDeclarationDate?: string;
    },
    companyId: string,
  ) {
    const existing = await prisma.companyTools.findUnique({ where: { id } });
    if (!existing) throw new AppError("Company tools not found", 404);
    if (existing.companyId !== companyId) {
      throw new AppError("You are not authorized to update this resource", 403);
    }

    // Validate tax reporting frequency
    if (
      data.taxReportingFrequency &&
      !["Monthly", "Quarterly"].includes(data.taxReportingFrequency)
    ) {
      throw new AppError(
        "Tax reporting frequency must be either 'Monthly' or 'Quarterly'",
        400,
      );
    }

    const updateData: Record<string, unknown> = {};

    if (typeof data.markupPrice !== "undefined") {
      updateData.markupPrice = data.markupPrice;
    }

    if (typeof data.taxRate !== "undefined") {
      updateData.taxRate = data.taxRate;
    }

    if (data.companySignature) {
      updateData.companySignature = data.companySignature;
    } else if (existing.companySignature) {
      updateData.companySignature = existing.companySignature;
    }

    if (data.companyStamp) {
      updateData.companyStamp = data.companyStamp;
    } else if (existing.companyStamp) {
      updateData.companyStamp = existing.companyStamp;
    }

    if (typeof data.businessTin !== "undefined") {
      updateData.businessTin = data.businessTin?.trim() || null;
    }

    if (typeof data.taxReportingFrequency !== "undefined") {
      updateData.taxReportingFrequency = data.taxReportingFrequency || null;
    }

    if (typeof data.ebmDeviceSerialNumber !== "undefined") {
      updateData.ebmDeviceSerialNumber = data.ebmDeviceSerialNumber || null;
    }

    if (Array.isArray(data.bankAccounts)) {
      const normalized = data.bankAccounts
        .filter((a) => a && (a.bankName?.trim() || a.accountNumber?.trim()))
        .map((a) => ({
          bankName:
            typeof a.bankName === "string" ? a.bankName.trim() : undefined,
          accountNumber:
            typeof a.accountNumber === "string"
              ? a.accountNumber.trim()
              : undefined,
        }));
      updateData.bankAccounts = normalized;
    }

    if (typeof data.invoiceDeclarationDate !== "undefined") {
      updateData.invoiceDeclarationDate = data.invoiceDeclarationDate
        ? new Date(data.invoiceDeclarationDate)
        : null;
    }

    const updated = await prisma.companyTools.update({
      where: { id },
      data: updateData,
      include: {
        company: {
          select: { name: true, TIN: true },
        },
      },
    });

    if (data.businessTin) {
      await prisma.company.update({
        where: { id: companyId },
        data: { TIN: data.businessTin.trim() },
      });
    }

    // EBM Initialization logic removed from here as per new requirements.
    // It should now be explicitly triggered via the initializeEbmDevice endpoint.

    return {
      message: "Company tools updated successfully",
      data: CompanyToolsService.mapCompanyTools(updated),
    };
  }

  public static async deleteCompanyTools(id: string, companyId: string) {
    const existing = await prisma.companyTools.findUnique({ where: { id } });
    if (!existing) throw new AppError("Company tools not found", 404);
    if (existing.companyId !== companyId) {
      throw new AppError("You are not authorized to delete this resource", 403);
    }

    await prisma.companyTools.delete({ where: { id } });

    return { message: "Company tools deleted successfully" };
  }

  public static async initializeEbmDevice(
    data: { tin: string; ebmDeviceSerialNumber: string; bhfId: string },
    companyId: string,
  ) {
    // Basic validation
    if (!data.tin || !data.ebmDeviceSerialNumber || !data.bhfId) {
      throw new AppError(
        "TIN, Serial Number, and Branch ID are required for EBM initialization",
        400,
      );
    }

    try {
      const connectionStatus = await EbmService.checkConnection();

      if (!connectionStatus.connected) {
        return {
          message: connectionStatus.message,
          data: connectionStatus,
          success: false,
        };
      }

      // 1. Initialize with EBM API
      const ebmResponse = await EbmService.initializeDevice(
        data.tin,
        data.bhfId,
        data.ebmDeviceSerialNumber,
      );

      console.log(
        `[EBM Device Init] Result: ${ebmResponse.resultCd} - ${ebmResponse.resultMsg}`,
      );

      // Check for errors (anything other than success codes)
      // "000" = success, "902" = already initialized (also acceptable)
      if (ebmResponse.resultCd !== "902" && ebmResponse.resultCd !== "000") {
        const message = CompanyToolsService.ebmInitUserMessage({
          resultCd: ebmResponse.resultCd,
          resultMsg: ebmResponse.resultMsg,
          tin: data.tin,
          bhfId: data.bhfId,
          dvcSrlNo: data.ebmDeviceSerialNumber,
        });

        return {
          message,
          data: ebmResponse,
          success: false,
        };
      }

      // 2. Update database fields only if initialization was successful or already exists
      // Update Company TIN
      await prisma.company.update({
        where: { id: companyId },
        data: { TIN: data.tin.trim() },
      });

      // Persist TIN, serial, and the EBM branch used for registration
      const tools = await prisma.companyTools.findFirst({
        where: { companyId },
      });

      if (tools) {
        await prisma.companyTools.update({
          where: { id: tools.id },
          data: {
            businessTin: data.tin.trim(),
            ebmDeviceSerialNumber: data.ebmDeviceSerialNumber.trim(),
            ebmBhfId: data.bhfId.trim(),
          },
        });
      } else {
        await prisma.companyTools.create({
          data: {
            companyId,
            businessTin: data.tin.trim(),
            ebmDeviceSerialNumber: data.ebmDeviceSerialNumber.trim(),
            ebmBhfId: data.bhfId.trim(),
            markupPrice: 0,
            taxRate: 0,
          },
        });
      }

      // Mark this branch as the EBM-initialized/active branch for the company
      await EbmService.markBranchEbmInitialized({
        companyId,
        bhfId: data.bhfId,
        dvcSrlNo: data.ebmDeviceSerialNumber,
      });

      // Return appropriate message based on result code
      const message = CompanyToolsService.ebmInitUserMessage({
        resultCd: ebmResponse.resultCd,
        resultMsg: ebmResponse.resultMsg,
        tin: data.tin,
        bhfId: data.bhfId,
        dvcSrlNo: data.ebmDeviceSerialNumber,
      });

      return {
        message,
        data: ebmResponse,
        success: true,
      };
    } catch (error: any) {
      console.error("EBM Initialization failed:", error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        error.message || "Failed to initialize EBM device",
        500,
      );
    }
  }

  public static async getEbmConnectionStatus() {
    const status = await EbmService.checkConnection();

    return {
      message: status.message,
      data: status,
      success: status.connected,
    };
  }

  public static async getCompanyToolsList(
    req: Request,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const items = await prisma.companyTools.findMany({
      where: { companyId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          select: { name: true, logo: true, website: true, TIN: true },
        },
      },
    });

    const totalItems = await prisma.companyTools.count({
      where: { companyId },
    });

    return {
      data: items.map((it) => CompanyToolsService.mapCompanyTools(it)),
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || items.length,
      message: "Company tools retrieved successfully",
    };
  }

  public static async getSTRDashboard(req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const strSummary = await SellThroughRateService.getSTRSummary(req);
    const topPerformers = await SellThroughRateService.getCompanySTR(req);
    const top5 = topPerformers.slice(0, 5);
    const worst5 = topPerformers.slice(-5).reverse();

    return {
      message: "STR Dashboard data retrieved successfully",
      data: {
        summary: strSummary,
        topPerformers: top5,
        worstPerformers: worst5,
        lastUpdated: new Date(),
      },
    };
  }
}
