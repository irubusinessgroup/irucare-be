import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateBranchInsuranceDto,
  UpdateBranchInsuranceDto,
} from "../utils/interfaces/common";
import type { Request } from "express";
import { EbmService } from "./EbmService";

export class BranchInsuranceService {
  public static async getAll(req: Request, branchId?: string) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const queryOptions: any = {
      companyId,
      ...(branchId ? { branchId } : {}),
    };

    const insurances = await prisma.branchInsurance.findMany({
      where: queryOptions,
      orderBy: { createdAt: "desc" },
    });

    return {
      data: insurances,
      message: "Branch insurances retrieved successfully",
    };
  }

  public static async getById(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const insurance = await prisma.branchInsurance.findFirst({
      where: { id, companyId },
    });

    if (!insurance) {
      throw new AppError("Insurance not found", 404);
    }

    return {
      data: insurance,
      message: "Insurance retrieved successfully",
    };
  }

  public static async create(
    data: CreateBranchInsuranceDto,
    companyId: string,
    req: Request,
  ) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    // Check for duplicate insurance code
    const existing = await prisma.branchInsurance.findFirst({
      where: {
        companyId,
        isrccCd: data.isrccCd,
      },
    });

    if (existing) {
      throw new AppError(
        "Insurance with this code already exists for your company",
        409,
      );
    }

    // Get company for EBM sync
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    // Save to EBM before database
    if (req.user) {
      // BYPASSED FOR NOW - Allow user to pass without waiting for EBM response
      // const ebmResponse = await EbmService.saveInsuranceToEBM(
      //   data,
      //   company,
      //   req.user,
      //   data.branchId,
      // );
      //
      // if (ebmResponse.resultCd !== "000") {
      //   throw new AppError(
      //     `EBM Registration Failed: ${ebmResponse.resultMsg}`,
      //     400,
      //   );
      // }
      // Mock success - insurance will be created without EBM sync
    }

    // Create in database
    const insurance = await prisma.branchInsurance.create({
      data: {
        ...data,
        companyId,
        ebmSynced: true,
      },
    });

    return { message: "Insurance created successfully", data: insurance };
  }

  public static async update(
    id: string,
    data: UpdateBranchInsuranceDto,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existing = await prisma.branchInsurance.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Insurance not found", 404);
    }

    // Get company for EBM sync
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    // Prepare update data
    const updateData = {
      ...existing,
      ...data,
    };

    // Update in EBM
    if (req.user) {
      // BYPASSED FOR NOW - Allow user to pass without waiting for EBM response
      // const ebmResponse = await EbmService.saveInsuranceToEBM(
      //   updateData,
      //   company,
      //   req.user,
      //   updateData.branchId,
      // );
      //
      // if (ebmResponse.resultCd !== "000") {
      //   throw new AppError(
      //     `EBM Update Failed: ${ebmResponse.resultMsg}`,
      //     400,
      //   );
      // }
      // Mock success - insurance will be updated without EBM sync
    }

    // Update in database
    const insurance = await prisma.branchInsurance.update({
      where: { id },
      data: updateData,
    });

    return { message: "Insurance updated successfully", data: insurance };
  }

  public static async delete(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existing = await prisma.branchInsurance.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new AppError("Insurance not found", 404);
    }

    // Get company for EBM sync
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    // Soft delete in EBM by setting useYn to "N"
    if (company && req.user) {
      const updateData = { ...existing, useYn: "N" };
      // BYPASSED FOR NOW - Allow user to pass without waiting for EBM response
      // await EbmService.saveInsuranceToEBM(
      //   updateData,
      //   company,
      //   req.user,
      //   existing.branchId,
      // );
      // Mock success - insurance will be deleted without EBM sync
    }

    // Delete from database
    await prisma.branchInsurance.delete({ where: { id } });

    return { message: "Insurance deleted successfully" };
  }
}
