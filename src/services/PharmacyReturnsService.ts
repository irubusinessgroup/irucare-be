import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { IPaged, IResponse } from "../utils/interfaces/common";
import { Paginations } from "../utils/DBHelpers";
import {
  CreateReturnRequest,
  ReturnResponse,
} from "../utils/interfaces/common";

export class PharmacyReturnsService {
  static async createReturn(
    data: CreateReturnRequest,
    companyId: string,
    userId: string
  ): Promise<IResponse<ReturnResponse>> {
    // Verify item exists
    const item = await prisma.items.findFirst({
      where: { id: data.itemId, companyId },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    // If dispense is provided, verify it exists
    if (data.dispenseId) {
      const dispense = await prisma.pharmacyDispenses.findFirst({
        where: { id: data.dispenseId, companyId },
      });

      if (!dispense) {
        throw new AppError("Dispense not found", 404);
      }

      // Verify the dispense item matches the return item
      if (dispense.itemId !== data.itemId) {
        throw new AppError("Return item does not match dispensed item", 400);
      }
    }

    // If prescription is provided, verify it exists
    if (data.prescriptionId) {
      const prescription = await prisma.prescription.findFirst({
        where: { id: data.prescriptionId, companyId },
      });

      if (!prescription) {
        throw new AppError("Prescription not found", 404);
      }
    }

    const returnRecord = await prisma.pharmacyReturns.create({
      data: {
        dispenseId: data.dispenseId,
        prescriptionId: data.prescriptionId,
        companyId,
        itemId: data.itemId,
        quantity: data.quantity,
        unit: data.unit,
        returnReason: data.returnReason,
        reasonNotes: data.reasonNotes,
        returnedBy: userId,
      },
    });

    return {
      statusCode: 201,
      message: "Return created successfully",
      data: returnRecord as any,
    };
  }

  static async getReturns(
    companyId: string,
    limit?: number,
    currentPage?: number
  ): Promise<IPaged<ReturnResponse[]>> {
    try {
      const pagination = Paginations(currentPage, limit);

      const returns = await prisma.pharmacyReturns.findMany({
        where: { companyId },
        ...pagination,
        orderBy: { returnedAt: "desc" },
        include: {
          item: {
            select: {
              itemFullName: true,
            },
          },
          dispense: {
            select: {
              patient: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      const totalItems = await prisma.pharmacyReturns.count({
        where: { companyId },
      });

      return {
        statusCode: 200,
        message: "Returns fetched successfully",
        data: returns as any,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async getReturnById(
    returnId: string,
    companyId: string
  ): Promise<IResponse<ReturnResponse>> {
    const returnRecord = await prisma.pharmacyReturns.findFirst({
      where: {
        id: returnId,
        companyId,
      },
      include: {
        item: {
          select: {
            itemFullName: true,
          },
        },
        dispense: {
          select: {
            patient: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!returnRecord) {
      throw new AppError("Return not found", 404);
    }

    return {
      statusCode: 200,
      message: "Return fetched successfully",
      data: returnRecord as any,
    };
  }
}
