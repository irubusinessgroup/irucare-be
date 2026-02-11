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

    // Trigger EBM Initialization if serial number is updated
    if (
      data.ebmDeviceSerialNumber &&
      data.ebmDeviceSerialNumber !== existing.ebmDeviceSerialNumber
    ) {
      try {
        const tin =
          data.businessTin ||
          existing.businessTin ||
          updated.company?.TIN ||
          "";
        if (tin) {
          // BYPASSED FOR NOW - Allow user to pass without waiting for EBM response
          // const ebmResponse = await EbmService.initializeDevice(
          //   tin,
          //   "00",
          //   data.ebmDeviceSerialNumber,
          // );
          // console.log(
          //   `[EBM Device Init] Result: ${ebmResponse.resultCd} - ${ebmResponse.resultMsg}`,
          // );
          //
          // if (
          //   ebmResponse.resultCd !== "902" &&
          //   ebmResponse.resultCd !== "000"
          // ) {
          //   // We don't throw here to avoid blocking the save, but we log it.
          //   // If user requested strict initialization, we could throw AppError.
          // }
          console.log(
            `[EBM Device Init] BYPASSED - Device initialization skipped for ${tin}`,
          );
        }
      } catch (error) {
        console.error("EBM Initialization failed:", error);
      }
    }

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
