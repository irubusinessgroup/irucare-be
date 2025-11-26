import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  CreateEncounterDto,
  EncounterFilters,
  IPaged,
  IResponse,
  UpdateEncounterDto,
} from "../utils/interfaces/common";
import { EncounterStatus, Prisma } from "@prisma/client";

export class EncounterService {
  /**
   * List encounters with filters and pagination
   */
  public static async list(
    req: Request,
    page?: number,
    limit?: number,
    filters?: EncounterFilters
  ): Promise<IPaged<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const dateWhere =
      filters?.startDate || filters?.endDate
        ? {
            createdAt: {
              gte: filters?.startDate ? new Date(filters.startDate) : undefined,
              lte: filters?.endDate ? new Date(filters.endDate) : undefined,
            },
          }
        : {};

    let statusWhere = {};
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        statusWhere = { status: { in: filters.status } };
      } else {
        statusWhere = { status: filters.status };
      }
    }

    const where = {
      companyId,
      patientId: filters?.patientId,
      providerId: filters?.providerId,
      appointmentId: filters?.appointmentId,
      visitType: filters?.visitType,
      ...dateWhere,
      ...statusWhere,
    };

    const [data, totalItems] = await Promise.all([
      prisma.encounter.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
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
              specialty: true,
            },
          },
          triage: true,
          consultation: {
            include: {
              diagnoses: true,
            },
          },
        },
      }),
      prisma.encounter.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Encounters fetched successfully",
    };
  }

  /**
   * Get encounter by ID with full details
   */
  public static async getById(
    id: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const encounter = await prisma.encounter.findFirst({
      where: { id, companyId },
      include: {
        patient: true,
        provider: true,
        appointment: true,
        triage: true,
        consultation: {
          include: {
            diagnoses: true,
          },
        },
        prescriptions: {
          orderBy: { prescribedAt: "desc" },
        },
        labOrders: {
          include: {
            test: true,
            results: true,
          },
          orderBy: { orderedAt: "desc" },
        },
        imagingOrders: {
          orderBy: { orderedAt: "desc" },
        },
        procedureOrders: {
          orderBy: { orderedAt: "desc" },
        },
        clinicalNotes: {
          orderBy: { createdAt: "desc" },
        },
        careProgramVisits: {
          include: {
            enrollment: {
              include: {
                program: true,
              },
            },
          },
        },
      },
    });

    if (!encounter) {
      throw new AppError("Encounter not found", 404);
    }

    return {
      statusCode: 200,
      message: "Encounter fetched successfully",
      data: encounter,
    };
  }

  /**
   * Create new encounter/visit
   */
  public static async create(
    req: Request,
    dto: CreateEncounterDto
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify patient and provider belong to company
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

    // Generate visit number
    const visitCount = await prisma.encounter.count({ where: { companyId } });
    const visitNumber = `V${String(visitCount + 1).padStart(6, "0")}`;

    const created = await prisma.encounter.create({
      data: {
        patientId: dto.patientId,
        providerId: dto.providerId,
        appointmentId: dto.appointmentId,
        companyId,
        visitType: dto.visitType || "OUTPATIENT",
        visitNumber,
        scheduledTime: dto.scheduledTime ? new Date(dto.scheduledTime) : null,
        status: "SCHEDULED",
        createdBy: userId,
      },
      include: {
        patient: true,
        provider: true,
      },
    });

    return {
      statusCode: 201,
      message: "Encounter created successfully",
      data: created,
    };
  }

  /**
   * Update encounter details
   */
  public static async update(
    id: string,
    dto: UpdateEncounterDto,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.encounter.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Encounter not found", 404);

    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new AppError("Cannot update a terminal encounter", 409);
    }

    const updated = await prisma.encounter.update({
      where: { id },
      data: {
        providerId: dto.providerId,
        visitType: dto.visitType,
        scheduledTime: dto.scheduledTime
          ? new Date(dto.scheduledTime)
          : undefined,
        status: dto.status,
      },
      include: {
        patient: true,
        provider: true,
      },
    });

    return {
      statusCode: 200,
      message: "Encounter updated successfully",
      data: updated,
    };
  }

  /**
   * Check-in patient for encounter
   */
  public static async checkIn(
    id: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const encounter = await prisma.encounter.findFirst({
      where: { id, companyId },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);
    if (encounter.status !== "SCHEDULED") {
      throw new AppError("Only scheduled encounters can be checked in", 409);
    }

    const updated = await prisma.encounter.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        checkInTime: new Date(),
        startTime: new Date(),
      },
    });

    return {
      statusCode: 200,
      message: "Patient checked in successfully",
      data: updated,
    };
  }

  /**
   * Complete encounter
   */
  public static async complete(
    id: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const encounter = await prisma.encounter.findFirst({
      where: { id, companyId },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);
    if (encounter.status === "COMPLETED" || encounter.status === "CANCELLED") {
      throw new AppError("Encounter already in terminal state", 409);
    }

    const updated = await prisma.encounter.update({
      where: { id },
      data: {
        status: "COMPLETED",
        endTime: new Date(),
      },
    });

    return {
      statusCode: 200,
      message: "Encounter completed successfully",
      data: updated,
    };
  }

  /**
   * Cancel encounter
   */
  public static async cancel(
    id: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const encounter = await prisma.encounter.findFirst({
      where: { id, companyId },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);
    if (encounter.status === "COMPLETED" || encounter.status === "CANCELLED") {
      throw new AppError("Encounter already in terminal state", 409);
    }

    const updated = await prisma.encounter.update({
      where: { id },
      data: {
        status: "CANCELLED",
        endTime: new Date(),
      },
    });

    return {
      statusCode: 200,
      message: "Encounter cancelled successfully",
      data: updated,
    };
  }

  /**
   * Mark as no-show
   */
  public static async noShow(
    id: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const encounter = await prisma.encounter.findFirst({
      where: { id, companyId },
    });

    if (!encounter) throw new AppError("Encounter not found", 404);
    if (encounter.status !== "SCHEDULED") {
      throw new AppError(
        "Only scheduled encounters can be marked as no-show",
        409
      );
    }

    const updated = await prisma.encounter.update({
      where: { id },
      data: {
        status: "NO_SHOW",
      },
    });

    return {
      statusCode: 200,
      message: "Encounter marked as no-show",
      data: updated,
    };
  }

  /**
   * Delete encounter (soft delete or hard delete based on status)
   */
  public static async remove(
    id: string,
    req: Request
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.encounter.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Encounter not found", 404);

    // Only allow deletion of scheduled or cancelled encounters
    if (existing.status === "IN_PROGRESS" || existing.status === "COMPLETED") {
      throw new AppError(
        "Cannot delete in-progress or completed encounters",
        409
      );
    }

    await prisma.encounter.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Encounter deleted successfully",
    };
  }

  /**
   * Get visit history for a patient
   */
  public static async getPatientHistory(
    patientId: string,
    req: Request,
    page?: number,
    limit?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (pageNum - 1) * limitNum;

    const where = {
      companyId,
      patientId,
      status: { in: [EncounterStatus.COMPLETED, EncounterStatus.IN_PROGRESS] },
    };

    const [data, totalItems] = await Promise.all([
      prisma.encounter.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              specialty: true,
            },
          },
          triage: true,
          consultation: {
            include: {
              diagnoses: true,
            },
          },
          prescriptions: {
            where: { status: { not: "CANCELLED" } },
          },
          labOrders: {
            where: { status: { in: ["COMPLETED", "IN_PROGRESS"] } },
          },
        },
      }),
      prisma.encounter.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Visit history fetched successfully",
    };
  }
}
