import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { IPaged, IResponse } from "../utils/interfaces/common";
import { Paginations } from "../utils/DBHelpers";
import {
  CreateDispenseRequest,
  UpdateDispenseRequest,
  DispenseResponse,
  DispenseStatus,
} from "../utils/interfaces/common";

export class PharmacyDispensingService {
  static async createDispense(
    data: CreateDispenseRequest,
    companyId: string,
    userId: string,
  ): Promise<IResponse<DispenseResponse>> {
    // Verify patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: data.patientId, companyId },
    });

    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    // Verify item exists
    const item = await prisma.items.findFirst({
      where: { id: data.itemId, companyId },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
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

    const dispense = await prisma.pharmacyDispenses.create({
      data: {
        prescriptionId: data.prescriptionId,
        patientId: data.patientId,
        companyId,
        itemId: data.itemId,
        quantity: data.quantity,
        unit: data.unit,
        batchNumber: data.batchNumber,
        expiryDate: data.expiryDate,
        status: DispenseStatus.PENDING,
        dispensedBy: userId,
        notes: data.notes,
      },
    });

    return {
      statusCode: 201,
      message: "Dispense created successfully",
      data: dispense as any,
    };
  }

  static async getDispensingQueue(
    companyId: string,
    status?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<DispenseResponse[]>> {
    try {
      const pagination = Paginations(currentPage, limit);

      const whereClause: any = { companyId };
      if (status) {
        whereClause.status = status;
      }

      const dispenses = await prisma.pharmacyDispenses.findMany({
        where: whereClause,
        ...pagination,
        orderBy: { createdAt: "desc" },
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

      const totalItems = await prisma.pharmacyDispenses.count({
        where: whereClause,
      });

      return {
        statusCode: 200,
        message: "Dispensing queue fetched successfully",
        data: dispenses as any,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  static async getDispenseById(
    dispenseId: string,
    companyId: string,
  ): Promise<IResponse<DispenseResponse>> {
    const dispense = await prisma.pharmacyDispenses.findFirst({
      where: {
        id: dispenseId,
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

    if (!dispense) {
      throw new AppError("Dispense not found", 404);
    }

    return {
      statusCode: 200,
      message: "Dispense fetched successfully",
      data: dispense as any,
    };
  }

  static async updateDispense(
    dispenseId: string,
    data: UpdateDispenseRequest,
    companyId: string,
  ): Promise<IResponse<DispenseResponse>> {
    const existingDispense = await prisma.pharmacyDispenses.findFirst({
      where: {
        id: dispenseId,
        companyId,
      },
    });

    if (!existingDispense) {
      throw new AppError("Dispense not found", 404);
    }

    const updateData: any = {};
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.batchNumber !== undefined)
      updateData.batchNumber = data.batchNumber;
    if (data.expiryDate !== undefined) updateData.expiryDate = data.expiryDate;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.dispensedAt !== undefined)
      updateData.dispensedAt = data.dispensedAt;
    if (data.notes !== undefined) updateData.notes = data.notes;

    // If status is being changed to DISPENSED, set dispensedAt if not provided
    if (data.status === DispenseStatus.DISPENSED && !data.dispensedAt) {
      updateData.dispensedAt = new Date();
    }

    const updatedDispense = await prisma.pharmacyDispenses.update({
      where: { id: dispenseId },
      data: updateData,
    });

    return {
      statusCode: 200,
      message: "Dispense updated successfully",
      data: updatedDispense as any,
    };
  }
}
