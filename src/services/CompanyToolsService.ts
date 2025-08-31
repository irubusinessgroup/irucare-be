import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";

export class CompanyToolsService {
  public static async createCompanyTools(
    data: {
      sellingPercentage?: number;
      companySignature?: string | Express.Multer.File;
      companyStamp?: string | Express.Multer.File;
    },
    companyId: string,
  ) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new AppError("Company not found", 404);

    const created = await prisma.companyTools.create({
      data: {
        sellingPercentage: data.sellingPercentage,
        companySignature:
          typeof data.companySignature === "string"
            ? data.companySignature
            : undefined,
        companyStamp:
          typeof data.companyStamp === "string" ? data.companyStamp : undefined,
        company: { connect: { id: companyId } },
      },
    });

    return { message: "Company tools created successfully", data: created };
  }

  public static async getCompanyTools(id: string) {
    const tools = await prisma.companyTools.findUnique({ where: { id } });
    if (!tools) throw new AppError("Company tools not found", 404);

    return { message: "Company tools fetched successfully", data: tools };
  }

  public static async updateCompanyTools(
    id: string,
    data: {
      sellingPercentage?: number;
      companySignature?: string | Express.Multer.File;
      companyStamp?: string | Express.Multer.File;
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
    if (typeof data.companySignature === "string") {
      updateData.companySignature = data.companySignature;
    }
    if (typeof data.companyStamp === "string") {
      updateData.companyStamp = data.companyStamp;
    }

    const updated = await prisma.companyTools.update({
      where: { id },
      data: updateData,
    });

    return { message: "Company tools updated successfully", data: updated };
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
    });

    const totalItems = await prisma.companyTools.count({
      where: { companyId },
    });

    return {
      data: items,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || items.length,
      message: "Company tools retrieved successfully",
    };
  }
}
