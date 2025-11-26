import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { IPaged, IResponse } from "../utils/interfaces/common";
import { Paginations } from "../utils/DBHelpers";
import {
  CreateAdjustmentRequest,
  AdjustmentResponse,
} from "../utils/interfaces/common";

export class PharmacyAdjustmentsService {
  static async createAdjustment(
    data: CreateAdjustmentRequest,
    companyId: string,
    userId: string,
  ): Promise<IResponse<AdjustmentResponse>> {
    // Verify item exists
    const item = await prisma.items.findFirst({
      where: { id: data.itemId, companyId },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    const adjustment = await prisma.pharmacyAdjustments.create({
      data: {
        companyId,
        itemId: data.itemId,
        adjustmentType: data.adjustmentType,
        quantity: data.quantity,
        unit: data.unit,
        reason: data.reason,
        adjustedBy: userId,
      },
    });

    return {
      statusCode: 201,
      message: "Adjustment created successfully",
      data: {
        ...adjustment,
        quantity: Number(adjustment.quantity),
      },
    };
  }

  static async getAdjustments(
    companyId: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<AdjustmentResponse[]>> {
    try {
      const pagination = Paginations(currentPage, limit);

      const adjustments = await prisma.pharmacyAdjustments.findMany({
        where: { companyId },
        ...pagination,
        orderBy: { adjustedAt: "desc" },
        include: {
          item: {
            select: {
              itemFullName: true,
            },
          },
        },
      });

      const totalItems = await prisma.pharmacyAdjustments.count({
        where: { companyId },
      });

      return {
        statusCode: 200,
        message: "Adjustments fetched successfully",
        data: adjustments as any,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async getAdjustmentById(
    adjustmentId: string,
    companyId: string,
  ): Promise<IResponse<AdjustmentResponse>> {
    const adjustment = await prisma.pharmacyAdjustments.findFirst({
      where: {
        id: adjustmentId,
        companyId,
      },
      include: {
        item: {
          select: {
            itemFullName: true,
          },
        },
      },
    });

    if (!adjustment) {
      throw new AppError("Adjustment not found", 404);
    }

    return {
      statusCode: 200,
      message: "Adjustment fetched successfully",
      data: adjustment as any,
    };
  }
}