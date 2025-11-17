import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import type {
  CreatePrescriptionDto,
  UpdatePrescriptionDto,
} from "../utils/interfaces/common";
import { ClinicalDecisionSupportService } from "./ClinicalDecisionSupportService";
import { Prisma } from "@prisma/client";

export type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export class PrescriptionService {
  public static async list(
    page?: number,
    limit?: number,
    filters?: {
      patientId?: string;
      providerId?: string;
      encounterId?: string;
      status?: PrescriptionStatus;
    },
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;
    const where = {
      patientId: filters?.patientId || undefined,
      providerId: filters?.providerId || undefined,
      encounterId: filters?.encounterId || undefined,
      status: filters?.status || undefined,
    };
    const [data, totalItems] = await Promise.all([
      prisma.prescription.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.prescription.count({ where }),
    ]);
    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Prescriptions fetched successfully",
    };
  }

  public static async getById(id: string): Promise<IResponse<unknown>> {
    const record = await prisma.prescription.findUnique({ where: { id } });
    if (!record) throw new AppError("Prescription not found", 404);
    return {
      statusCode: 200,
      message: "Prescription fetched successfully",
      data: record,
    };
  }

  public static async create(
    req: Request,
    dto: CreatePrescriptionDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);

    const companyId =
      (req.user && typeof req.user === "object"
        ? (req.user as unknown as { company?: { companyId?: string } }).company
            ?.companyId
        : undefined) || undefined;

    // Validate itemId if provided
    if (dto.itemId) {
      const item = await prisma.items.findFirst({
        where: {
          id: dto.itemId,
          companyId: companyId || undefined,
        },
        include: {
          category: true,
        },
      });

      if (!item) {
        throw new AppError("Item not found or doesn't belong to company", 404);
      }

      // Check if item is a medication (could check category)
      // For now, we'll just validate it exists
    }

    // Run clinical decision support validation
    let validationWarnings: unknown[] = [];
    try {
      const warnings =
        await ClinicalDecisionSupportService.validatePrescription(
          dto.patientId,
          dto.items,
        );
      validationWarnings = warnings as unknown[];
    } catch (error) {
      // Log error but don't block prescription creation
      console.error("Error during prescription validation:", error);
    }

    const created = await prisma.prescription.create({
      data: {
        patientId: dto.patientId,
        providerId: dto.providerId,
        encounterId: dto.encounterId,
        items: dto.items as unknown as object[],
        status: "ACTIVE",
        prescribedDate: new Date(),
        refillsAllowed: dto.refillsAllowed ?? 0,
        refillsUsed: 0,
        pharmacyNotes: dto.pharmacyNotes,
        itemId: dto.itemId,
        validationWarnings:
          validationWarnings.length > 0
            ? (validationWarnings as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        createdBy: userId,
      },
    });

    return {
      statusCode: 201,
      message: "Prescription created",
      data: {
        ...created,
        validationWarnings:
          validationWarnings.length > 0 ? validationWarnings : undefined,
      },
    };
  }

  public static async update(
    id: string,
    dto: UpdatePrescriptionDto,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new AppError("Prescription not found", 404);
    const updated = await prisma.prescription.update({
      where: { id },
      data: {
        items:
          (dto.items as unknown as object[]) ??
          (existing.items as unknown as object[]),
        refillsAllowed: dto.refillsAllowed ?? existing.refillsAllowed,
        pharmacyNotes: dto.pharmacyNotes ?? existing.pharmacyNotes,
        status: dto.status ?? existing.status,
      },
    });
    return { statusCode: 200, message: "Prescription updated", data: updated };
  }

  public static async remove(id: string): Promise<IResponse<null>> {
    const existing = await prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new AppError("Prescription not found", 404);
    await prisma.prescription.delete({ where: { id } });
    return { statusCode: 200, message: "Prescription deleted" };
  }

  public static async refill(id: string): Promise<IResponse<unknown>> {
    const existing = await prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new AppError("Prescription not found", 404);
    if (existing.status !== "ACTIVE") {
      throw new AppError("Only ACTIVE prescriptions can be refilled", 409);
    }
    if (existing.refillsUsed >= existing.refillsAllowed) {
      const err = new AppError("No refills remaining", 409);
      // @ts-ignore add details
      err.details = { code: "REFILL_LIMIT_REACHED" };
      throw err;
    }
    const updated = await prisma.prescription.update({
      where: { id },
      data: { refillsUsed: existing.refillsUsed + 1 },
    });
    return { statusCode: 200, message: "Prescription refilled", data: updated };
  }

  public static async complete(id: string): Promise<IResponse<unknown>> {
    const existing = await prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new AppError("Prescription not found", 404);
    if (existing.status !== "ACTIVE") {
      throw new AppError("Cannot complete a non-active prescription", 409);
    }
    const updated = await prisma.prescription.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
    return {
      statusCode: 200,
      message: "Prescription completed",
      data: updated,
    };
  }

  public static async cancel(id: string): Promise<IResponse<unknown>> {
    const existing = await prisma.prescription.findUnique({ where: { id } });
    if (!existing) throw new AppError("Prescription not found", 404);
    if (existing.status !== "ACTIVE") {
      throw new AppError("Cannot cancel a non-active prescription", 409);
    }
    const updated = await prisma.prescription.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return {
      statusCode: 200,
      message: "Prescription cancelled",
      data: updated,
    };
  }
}
