import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { IPaged, IResponse } from "../utils/interfaces/common";
import { Paginations } from "../utils/DBHelpers";
import {
  CreateOTCSaleRequest,
  OTCSaleResponse,
} from "../utils/interfaces/common";

export class PharmacyOTCService {
  static async createOTCSale(
    data: CreateOTCSaleRequest,
    companyId: string,
    userId: string,
  ): Promise<IResponse<OTCSaleResponse>> {
    // Verify item exists
    const item = await prisma.items.findFirst({
      where: { id: data.itemId, companyId },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    // If patient is provided, verify they exist
    if (data.patientId) {
      const patient = await prisma.patient.findFirst({
        where: { id: data.patientId, companyId },
      });

      if (!patient) {
        throw new AppError("Patient not found", 404);
      }
    }

    // Calculate total amount
    const totalAmount = data.quantity * data.unitPrice;

    const otcSale = await prisma.otcSales.create({
      data: {
        patientId: data.patientId,
        companyId,
        itemId: data.itemId,
        quantity: data.quantity,
        unit: data.unit,
        unitPrice: data.unitPrice,
        totalAmount,
        soldBy: userId,
        notes: data.notes,
      },
    });

    return {
      statusCode: 201,
      message: "OTC sale created successfully",
      data: otcSale,
    };
  }

  static async getOTCSales(
    companyId: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<OTCSaleResponse[]>> {
    try {
      const pagination = Paginations(currentPage, limit);

      const sales = await prisma.otcSales.findMany({
        where: { companyId },
        ...pagination,
        orderBy: { soldAt: "desc" },
        include: {
          patient: {
            select: {
              name: true,
            },
          },
          item: {
            select: {
              itemFullName: true,
            },
          },
        },
      });

      const totalItems = await prisma.otcSales.count({
        where: { companyId },
      });

      return {
        statusCode: 200,
        message: "OTC sales fetched successfully",
        data: sales as any,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async getOTCSaleById(
    saleId: string,
    companyId: string,
  ): Promise<IResponse<OTCSaleResponse>> {
    const sale = await prisma.otcSales.findFirst({
      where: {
        id: saleId,
        companyId,
      },
      include: {
        patient: {
          select: {
            name: true,
          },
        },
        item: {
          select: {
            itemFullName: true,
          },
        },
      },
    });

    if (!sale) {
      throw new AppError("OTC sale not found", 404);
    }

    return {
      statusCode: 200,
      message: "OTC sale fetched successfully",
      data: sale as any,
    };
  }
}
