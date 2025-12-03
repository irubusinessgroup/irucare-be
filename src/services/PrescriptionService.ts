import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  CreatePrescriptionDto,
  DispensePrescriptionDto,
  IPaged,
  IResponse,
  PrescriptionFilters,
  UpdatePrescriptionDto,
} from "../utils/interfaces/common";
import { PrescriptionStatus, Prisma } from "@prisma/client";

export class PrescriptionService {
  /**
   * List prescriptions with filters and pagination
   */
  public static async list(
    req: Request,
    page?: number,
    limit?: number,
    filters?: PrescriptionFilters,
  ): Promise<IPaged<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const dateWhere =
      filters?.startDate || filters?.endDate
        ? {
            prescribedAt: {
              gte: filters?.startDate ? new Date(filters.startDate) : undefined,
              lte: filters?.endDate ? new Date(filters.endDate) : undefined,
            },
          }
        : {};

    const where = {
      companyId,
      patientId: filters?.patientId,
      providerId: filters?.providerId,
      encounterId: filters?.encounterId,
      status: filters?.status,
      ...dateWhere,
    };

    const [data, totalItems] = await Promise.all([
      prisma.prescription.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { prescribedAt: "desc" },
        include: {
          patient: {
            select: {
              id: true,
              name: true,
              patientNO: true,
            },
          },
          provider: {
            select: {
              id: true,
              name: true,
            },
          },
          item: {
            select: {
              id: true,
              itemFullName: true,
              itemCodeSku: true,
            },
          },
          dispensedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.prescription.count({ where }),
    ]);

    return {
      data: data as any[],
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Prescriptions fetched successfully",
    };
  }

  /**
   * Get prescription by ID
   */
  public static async getById(
    id: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const prescription = await prisma.prescription.findFirst({
      where: { id, companyId },
      include: {
        patient: true,
        provider: true,
        encounter: {
          include: {
            triage: true,
            consultation: {
              include: {
                diagnoses: true,
              },
            },
          },
        },
        item: true,
        prescribedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        dispensedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        warehouse: true,
      },
    });

    if (!prescription) {
      throw new AppError("Prescription not found", 404);
    }

    return {
      statusCode: 200,
      message: "Prescription fetched successfully",
      data: prescription as any,
    };
  }

  /**
   * Create new prescription
   */
  public static async create(
    req: Request,
    dto: CreatePrescriptionDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify patient and provider
    const [patient, provider] = await Promise.all([
      prisma.patient.findFirst({
        where: { id: dto.patientId, companyId },
      }),
      prisma.provider.findFirst({
        where: { id: dto.providerId, companyId },
      }),
    ]);

    if (!patient) throw new AppError("Patient not found", 404);
    if (!provider) throw new AppError("Provider not found", 404);

    // Validate item if provided
    if (dto.itemId) {
      const item = await prisma.items.findFirst({
        where: {
          id: dto.itemId,
          companyId,
        },
      });

      if (!item) {
        throw new AppError("Item not found or doesn't belong to company", 404);
      }
    }

    // Check for drug interactions and allergies
    const validationWarnings = await this.validatePrescription(
      dto.patientId,
      dto.medicationName,
      companyId,
    );

    // Generate prescription number
    const prescriptionCount = await prisma.prescription.count({
      where: { companyId },
    });
    const prescriptionNumber = `RX${String(prescriptionCount + 1).padStart(6, "0")}`;

    const created = await prisma.prescription.create({
      data: {
        prescriptionNumber,
        patientId: dto.patientId,
        providerId: dto.providerId,
        encounterId: dto.encounterId,
        companyId,
        medicationName: dto.medicationName,
        itemId: dto.itemId,
        dosage: dto.dosage,
        frequency: dto.frequency,
        route: dto.route,
        duration: dto.duration,
        quantity: dto.quantity,
        unit: dto.unit,
        instructions: dto.instructions,
        indicationForUse: dto.indicationForUse,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        refillsAllowed: dto.refillsAllowed ?? 0,
        status: "ACTIVE",
        validationWarnings:
          validationWarnings.length > 0 ? validationWarnings : Prisma.JsonNull,
        prescribedBy: userId,
      },
      include: {
        patient: true,
        provider: true,
        item: true,
      },
    });

    return {
      statusCode: 201,
      message: "Prescription created successfully",
      data: {
        ...(created as any),
        warnings: validationWarnings,
      },
    };
  }

  /**
   * Update prescription
   */
  public static async update(
    id: string,
    dto: UpdatePrescriptionDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.prescription.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Prescription not found", 404);

    // Only DRAFT and ACTIVE prescriptions can be updated
    if (!["DRAFT", "ACTIVE"].includes(existing.status)) {
      throw new AppError("Cannot update prescription in current status", 409);
    }

    const updated = await prisma.prescription.update({
      where: { id },
      data: {
        medicationName: dto.medicationName,
        dosage: dto.dosage,
        frequency: dto.frequency,
        route: dto.route,
        duration: dto.duration,
        quantity: dto.quantity,
        unit: dto.unit,
        instructions: dto.instructions,
        indicationForUse: dto.indicationForUse,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        refillsAllowed: dto.refillsAllowed,
        status: dto.status,
      },
      include: {
        patient: true,
        provider: true,
      },
    });

    return {
      statusCode: 200,
      message: "Prescription updated successfully",
      data: updated as any,
    };
  }

  /**
   * Dispense prescription
   */
  public static async dispense(
    id: string,
    dto: DispensePrescriptionDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    const existing = await prisma.prescription.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Prescription not found", 404);

    if (existing.status !== "ACTIVE") {
      throw new AppError("Only active prescriptions can be dispensed", 409);
    }

    if (dto.quantityDispensed > existing.quantity) {
      throw new AppError("Quantity dispensed exceeds prescribed quantity", 400);
    }

    if (!existing.itemId) {
      throw new AppError("Prescription has no linked inventory item", 400);
    }

    if (!dto.warehouseId) {
      throw new AppError("Warehouse is required for dispensing", 400);
    }

    // Find real inventory stock batches
    const stockBatches = await prisma.stock.findMany({
      where: {
        stockReceipt: {
          itemId: existing.itemId,
          warehouseId: dto.warehouseId,
        },
        status: "AVAILABLE",
      },
      orderBy: { stockReceipt: { expiryDate: "asc" } }, // FIFO by expiry
      include: { stockReceipt: true },
    });

    if (stockBatches.length === 0) {
      throw new AppError("Item not available in this warehouse", 400);
    }

    // Ensure enough total quantity
    const totalAvailable = stockBatches.reduce(
      (sum, batch) => sum + Number(batch.quantityAvailable),
      0,
    );

    if (totalAvailable < dto.quantityDispensed) {
      throw new AppError("Insufficient stock to dispense this medication", 400);
    }

    //  Consume stock FIFO
    let toConsume = dto.quantityDispensed;

    const consumptionRecords: any[] = [];

    for (const batch of stockBatches) {
      if (toConsume <= 0) break;

      const available = Number(batch.quantityAvailable);
      const used = Math.min(available, toConsume);

      toConsume -= used;

      consumptionRecords.push({
        stockId: batch.id,
        used,
        batchNumber: batch.stockReceipt.invoiceNo ?? null,
        expiryDate: batch.stockReceipt.expiryDate ?? null,
      });
    }

    // If toConsume > 0, something is wrong
    if (toConsume > 0) {
      throw new AppError("Inventory error during dispensing", 500);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Update prescription
      const prescription = await tx.prescription.update({
        where: { id },
        data: {
          isDispensed: true,
          dispensedBy: userId,
          dispensedDate: new Date(),
          quantityDispensed: dto.quantityDispensed,
          warehouseId: dto.warehouseId,
          pharmacyNotes: dto.pharmacyNotes,
          status: "DISPENSED",
        },
        include: {
          patient: true,
          dispensedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Deduct stock from each consumed batch
      for (const record of consumptionRecords) {
        await tx.stock.update({
          where: { id: record.stockId },
          data: {
            quantityAvailable: {
              decrement: record.used,
            },
          },
        });
      }

      return prescription;
    });

    return {
      statusCode: 200,
      message: "Prescription dispensed successfully",
      data: updated as any,
    };
  }

  /**
   * Mark prescription as picked up
   */
  public static async pickup(
    id: string,
    pickedUpBy: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.prescription.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Prescription not found", 404);

    if (!existing.isDispensed) {
      throw new AppError("Prescription must be dispensed before pickup", 409);
    }

    if (existing.isPickedUp) {
      throw new AppError("Prescription already picked up", 409);
    }

    const updated = await prisma.prescription.update({
      where: { id },
      data: {
        isPickedUp: true,
        pickedUpBy,
        pickedUpDate: new Date(),
      },
    });

    return {
      statusCode: 200,
      message: "Prescription marked as picked up",
      data: updated as any,
    };
  }

  /**
   * Refill prescription
   */
  public static async refill(
    id: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.prescription.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Prescription not found", 404);

    if (existing.status !== "DISPENSED" && existing.status !== "COMPLETED") {
      throw new AppError(
        "Only dispensed or completed prescriptions can be refilled",
        409,
      );
    }

    if (existing.refillsUsed >= existing.refillsAllowed) {
      throw new AppError("No refills remaining", 409);
    }

    const updated = await prisma.prescription.update({
      where: { id },
      data: {
        refillsUsed: existing.refillsUsed + 1,
        status: "ACTIVE",
      },
    });

    return {
      statusCode: 200,
      message: "Prescription refilled successfully",
      data: updated as any,
    };
  }

  /**
   * Complete prescription
   */
  public static async complete(
    id: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.prescription.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Prescription not found", 404);

    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new AppError("Prescription already in terminal state", 409);
    }

    const updated = await prisma.prescription.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    return {
      statusCode: 200,
      message: "Prescription completed successfully",
      data: updated as any,
    };
  }

  /**
   * Cancel prescription
   */
  public static async cancel(
    id: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.prescription.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Prescription not found", 404);

    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new AppError("Prescription already in terminal state", 409);
    }

    const updated = await prisma.prescription.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return {
      statusCode: 200,
      message: "Prescription cancelled successfully",
      data: updated as any,
    };
  }

  /**
   * Get patient's prescription history
   */
  public static async getPatientHistory(
    patientId: string,
    req: Request,
    page?: number,
    limit?: number,
  ): Promise<IPaged<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      companyId,
      patientId,
      status: { not: PrescriptionStatus.CANCELLED },
    };

    const [data, totalItems] = await Promise.all([
      prisma.prescription.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { prescribedAt: "desc" },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
            },
          },
          encounter: {
            select: {
              id: true,
              visitNumber: true,
              visitType: true,
            },
          },
        },
      }),
      prisma.prescription.count({ where }),
    ]);

    return {
      data: data as any[],
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Prescription history fetched successfully",
    };
  }

  /**
   * Validate prescription for drug interactions and allergies
   */
  private static async validatePrescription(
    patientId: string,
    medicationName: string,
    companyId: string,
  ) {
    const warnings: any[] = [];

    // Check patient allergies from latest triage
    const latestTriage = await prisma.triage.findFirst({
      where: { patientId, companyId },
      orderBy: { capturedAt: "desc" },
    });

    if (latestTriage?.allergies) {
      const allergies = latestTriage.allergies.toLowerCase();
      if (allergies.includes(medicationName.toLowerCase())) {
        warnings.push({
          type: "ALLERGY",
          severity: "CRITICAL",
          message: `Patient has documented allergy to ${medicationName}`,
        });
      }
    }

    // Check for active prescriptions (drug interactions)
    const activePrescriptions = await prisma.prescription.findMany({
      where: {
        patientId,
        companyId,
        status: { in: ["ACTIVE", "DISPENSED"] },
      },
    });

    if (activePrescriptions.length > 0) {
      warnings.push({
        type: "INTERACTION",
        severity: "WARNING",
        message: `Patient has ${activePrescriptions.length} active prescription(s). Review for potential drug interactions.`,
        activeMedications: activePrescriptions.map((p) => p.medicationName),
      });
    }

    return warnings;
  }

  /**
   * Delete prescription
   */
  public static async remove(
    id: string,
    req: Request,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.prescription.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Prescription not found", 404);

    // Only allow deletion of DRAFT prescriptions
    if (existing.status !== "DRAFT") {
      throw new AppError("Only draft prescriptions can be deleted", 409);
    }

    await prisma.prescription.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Prescription deleted successfully",
    };
  }
}
