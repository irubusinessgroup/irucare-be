import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateInsuranceDto,
  UpdateInsuranceDto,
} from "../utils/interfaces/common";
import type { Request } from "express";

export class InsuranceService {
  public static async getAllInsurance(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const branchId = req.user?.branchId;
    console.log(`[InsuranceService DEBUG] companyId: ${companyId}, branchId: ${branchId}`);
    const queryOptions: any = searchq
      ? {
          companyId,
          branchId: branchId || null, // Explicitly filter
          name: { contains: searchq },
        }
      : {
          companyId,
          branchId: branchId || null, // Explicitly filter
        };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const insurance = await prisma.insurance.findMany({
      where: queryOptions,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.insurance.count({ where: queryOptions });

    return {
      data: insurance,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || insurance.length,
      message: "Insurance records retrieved successfully",
    };
  }

  public static async createInsurance(
    data: CreateInsuranceDto,
    companyId: string,
    branchId?: string | null
  ) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const insurance = await prisma.insurance.create({
      data: {
        name: data.name,
        tin: data.tin,
        phone: data.phone,
        description: data.description,
        address: data.address,
        companyId,
        branchId: branchId as any,
      },
    });
    return { message: "Insurance created successfully", data: insurance };
  }

  public static async updateInsurance(
    id: string,
    data: UpdateInsuranceDto,
    companyId: string,
    branchId?: string | null
  ) {
    const existingInsurance = await prisma.insurance.findFirst({
      where: {
        id,
        companyId,
        branchId: branchId || null,
      },
    });

    if (!existingInsurance) {
      throw new AppError("Insurance not found", 404);
    }

    const insurance = await prisma.insurance.update({
      where: { id },
      data: {
        name: data.name,
        tin: data.tin,
        phone: data.phone,
        description: data.description,
        address: data.address,
      },
    });

    return { message: "Insurance updated successfully", data: insurance };
  }

  public static async deleteInsurance(
    id: string,
    companyId: string,
    branchId?: string | null
  ) {
    const existingInsurance = await prisma.insurance.findFirst({
      where: {
        id,
        companyId,
        branchId: branchId || null,
      },
    });

    if (!existingInsurance) {
      throw new AppError("Insurance not found", 404);
    }

    await prisma.insurance.delete({ where: { id } });
    return { message: "Insurance deleted successfully" };
  }
}
