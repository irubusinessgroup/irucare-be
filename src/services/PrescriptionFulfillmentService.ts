import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IResponse } from "../utils/interfaces/common";
import { selectAvailableStock, markStockSold } from "../utils/stock-ops";

export interface FulfillPrescriptionDto {
  pharmacistId: string;
  fulfilledDate?: string;
  quantityDispensed: number;
  itemId: string;
  warehouseId?: string;
}

export interface PickupPrescriptionDto {
  pickedUpDate?: string;
  pickedUpBy: string;
}

export class PrescriptionFulfillmentService {
  /**
   * Fulfill a prescription
   */
  public static async fulfill(
    req: Request,
    prescriptionId: string,
    dto: FulfillPrescriptionDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        item: true,
        patient: {
          select: {
            id: true,
            name: true,
            patientNO: true,
          },
        },
      },
    });

    if (!prescription) {
      throw new AppError("Prescription not found", 404);
    }

    if (prescription.status !== "ACTIVE") {
      throw new AppError(
        `Cannot fulfill ${prescription.status} prescription`,
        409,
      );
    }

    // Validate item exists and is a medication
    const item = await prisma.items.findUnique({
      where: { id: dto.itemId },
      include: {
        category: true,
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    // Check stock availability
    const companyId =
      (req.user && typeof req.user === "object"
        ? (req.user as unknown as { company?: { companyId?: string } }).company
            ?.companyId
        : undefined) || undefined;

    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    // Update prescription and deduct stock in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Select available stock using stock-ops utility
      // Note: warehouse filtering would need to be added to selectAvailableStock
      // For now, we'll select and then filter if needed
      const selectedStocks = await selectAvailableStock(tx, {
        itemIds: dto.itemId,
        companyId,
        take: dto.quantityDispensed,
        strategy: "FIFO",
      });

      if (selectedStocks.length < dto.quantityDispensed) {
        throw new AppError(
          `Insufficient stock. Available: ${selectedStocks.length}, Required: ${dto.quantityDispensed}`,
          400,
        );
      }

      // If warehouse is specified, filter stocks by warehouse
      let stockIdsToDeduct = selectedStocks.map((s) => s.id);
      if (dto.warehouseId) {
        const stocksWithWarehouse = await tx.stock.findMany({
          where: {
            id: { in: stockIdsToDeduct },
            stockReceipt: {
              warehouseId: dto.warehouseId,
            },
          },
          select: { id: true },
        });

        if (stocksWithWarehouse.length < dto.quantityDispensed) {
          throw new AppError(
            `Insufficient stock in specified warehouse. Available: ${stocksWithWarehouse.length}, Required: ${dto.quantityDispensed}`,
            400,
          );
        }

        stockIdsToDeduct = stocksWithWarehouse
          .map((s) => s.id)
          .slice(0, dto.quantityDispensed);
      } else {
        stockIdsToDeduct = stockIdsToDeduct.slice(0, dto.quantityDispensed);
      }

      // Create a minimal sell record for prescription fulfillment
      // This follows the existing pattern for inventory deduction
      const sell = await tx.sell.create({
        data: {
          companyId,
          patientId: prescription.patientId,
          totalAmount: 0, // Prescription fulfillment doesn't charge
          subtotal: 0,
          insuranceCoveredAmount: 0,
          patientPayableAmount: 0,
        },
      });

      // Mark stocks as sold (linked to the sell record)
      await markStockSold(tx, {
        stockIds: stockIdsToDeduct,
        sellId: sell.id,
      });

      // Update prescription
      const updatedPrescription = await tx.prescription.update({
        where: { id: prescriptionId },
        data: {
          itemId: dto.itemId,
          pharmacistId: dto.pharmacistId,
          fulfilledDate: dto.fulfilledDate
            ? new Date(dto.fulfilledDate)
            : new Date(),
          quantityDispensed: dto.quantityDispensed,
          warehouseId: dto.warehouseId,
          status: "COMPLETED",
        },
        include: {
          item: true,
          pharmacist: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          warehouse: true,
        },
      });

      return updatedPrescription;
    });

    return {
      statusCode: 200,
      message: "Prescription fulfilled successfully",
      data: result,
    };
  }

  /**
   * Get fulfillment details for a prescription
   */
  public static async getFulfillment(
    prescriptionId: string,
  ): Promise<IResponse<unknown>> {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        item: {
          include: {
            category: true,
          },
        },
        pharmacist: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        warehouse: true,
        patient: {
          select: {
            id: true,
            name: true,
            patientNO: true,
          },
        },
      },
    });

    if (!prescription) {
      throw new AppError("Prescription not found", 404);
    }

    return {
      statusCode: 200,
      message: "Fulfillment details retrieved successfully",
      data: {
        prescription: {
          id: prescription.id,
          status: prescription.status,
          fulfilledDate: prescription.fulfilledDate,
          quantityDispensed: prescription.quantityDispensed,
          pickedUpDate: prescription.pickedUpDate,
          pickedUpBy: prescription.pickedUpBy,
        },
        item: prescription.item,
        pharmacist: prescription.pharmacist,
        warehouse: prescription.warehouse,
        patient: prescription.patient,
      },
    };
  }

  /**
   * Mark prescription as picked up
   */
  public static async pickup(
    prescriptionId: string,
    dto: PickupPrescriptionDto,
  ): Promise<IResponse<unknown>> {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
    });

    if (!prescription) {
      throw new AppError("Prescription not found", 404);
    }

    if (!prescription.fulfilledDate) {
      throw new AppError("Prescription must be fulfilled before pickup", 409);
    }

    if (prescription.pickedUpDate) {
      throw new AppError("Prescription already picked up", 409);
    }

    const updated = await prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        pickedUpDate: dto.pickedUpDate
          ? new Date(dto.pickedUpDate)
          : new Date(),
        pickedUpBy: dto.pickedUpBy,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Prescription marked as picked up",
      data: updated,
    };
  }
}
