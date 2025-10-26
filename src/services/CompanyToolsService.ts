import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { SellThroughRateService } from "./SellThroughRateService";

type CompanyToolsRow = {
  id: string;
  companyId: string;
  sellingPercentage: number | null;
  companySignature: string | null;
  companyStamp: string | null;
  bankAccounts: unknown;
  createdAt: Date;
  updatedAt: Date;
  company?: { name: string; logo?: string | null; website?: string | null };
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
    return { ...row, bankAccounts };
  }
  public static async createCompanyTools(
    data: {
      sellingPercentage?: number;
      companySignature?: string;
      companyStamp?: string;
      bankAccounts?: Array<{ bankName?: string; accountNumber?: string }>;
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

    const created = await prisma.companyTools.create({
      data: {
        sellingPercentage: data.sellingPercentage || 0,
        companySignature: data.companySignature,
        companyStamp: data.companyStamp,
        ...(Array.isArray(data.bankAccounts)
          ? {
              bankAccounts: data.bankAccounts,
            }
          : {}),
        company: { connect: { id: companyId } },
      },
      include: {
        company: {
          select: { name: true },
        },
      },
    });

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
          select: { name: true },
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
          select: { name: true, logo: true, website: true },
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
      sellingPercentage?: number;
      companySignature?: string;
      companyStamp?: string;
      bankAccounts?: Array<{ bankName?: string; accountNumber?: string }>;
    },
    companyId: string,
  ) {
    const existing = await prisma.companyTools.findUnique({ where: { id } });
    if (!existing) throw new AppError("Company tools not found", 404);
    if (existing.companyId !== companyId) {
      throw new AppError("You are not authorized to update this resource", 403);
    }

    const updateData: Record<string, unknown> = {};

    if (typeof data.sellingPercentage !== "undefined") {
      updateData.sellingPercentage = data.sellingPercentage;
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
          select: { name: true },
        },
      },
    });

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
          select: { name: true, logo: true, website: true },
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
