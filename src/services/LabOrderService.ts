import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  CreateLabOrderDto,
  IPaged,
  IResponse,
  LabOrderFilters,
  UpdateLabOrderDto,
} from "../utils/interfaces/common";

export class LabOrderService {
  /**
   * List lab orders with filters
   */
  public static async list(
    req: Request,
    page?: number,
    limit?: number,
    filters?: LabOrderFilters
  ): Promise<IPaged<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const dateWhere =
      filters?.startDate || filters?.endDate
        ? {
            orderedAt: {
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
      testCategory: filters?.testCategory,
      ...dateWhere,
    };

    const [data, totalItems] = await Promise.all([
      prisma.labOrder.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { orderedAt: "desc" },
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
          test: {
            select: {
              id: true,
              testCode: true,
              testName: true,
              category: true,
              testType: true,
            },
          },
          results: true,
        },
      }),
      prisma.labOrder.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Lab orders fetched successfully",
    };
  }

  /**
   * Get lab order by ID
   */
  public static async getById(
    id: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const labOrder = await prisma.labOrder.findFirst({
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
        test: true,
        orderedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        collectedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        results: {
          include: {
            enteredByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            approvedByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!labOrder) {
      throw new AppError("Lab order not found", 404);
    }

    return {
      statusCode: 200,
      message: "Lab order fetched successfully",
      data: labOrder,
    };
  }

  /**
   * Create lab order
   */
  public static async create(
    req: Request,
    dto: CreateLabOrderDto
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify encounter, patient, provider, and test
    const [encounter, patient, provider, test] = await Promise.all([
      prisma.encounter.findFirst({
        where: { id: dto.encounterId, companyId },
      }),
      prisma.patient.findFirst({
        where: { id: dto.patientId, companyId },
      }),
      prisma.provider.findFirst({
        where: { id: dto.providerId, companyId },
      }),
      prisma.labTest.findFirst({
        where: { id: dto.testId, companyId, isActive: true },
      }),
    ]);

    if (!encounter) throw new AppError("Encounter not found", 404);
    if (!patient) throw new AppError("Patient not found", 404);
    if (!provider) throw new AppError("Provider not found", 404);
    if (!test) throw new AppError("Lab test not found", 404);

    // Generate order number
    const orderCount = await prisma.labOrder.count({ where: { companyId } });
    const orderNumber = `LAB${String(orderCount + 1).padStart(6, "0")}`;

    const created = await prisma.labOrder.create({
      data: {
        orderNumber,
        encounterId: dto.encounterId,
        patientId: dto.patientId,
        providerId: dto.providerId,
        companyId,
        testId: dto.testId,
        testName: test.testName,
        testCategory: test.category,
        priority: dto.priority || "ROUTINE",
        clinicalNotes: dto.clinicalNotes,
        specialInstructions: dto.specialInstructions,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        status: "PENDING",
        orderedBy: userId,
      },
      include: {
        patient: true,
        provider: true,
        test: true,
      },
    });

    return {
      statusCode: 201,
      message: "Lab order created successfully",
      data: created,
    };
  }

  /**
   * Update lab order
   */
  public static async update(
    id: string,
    dto: UpdateLabOrderDto,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.labOrder.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab order not found", 404);

    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new AppError("Cannot update completed or cancelled order", 409);
    }

    const updated = await prisma.labOrder.update({
      where: { id },
      data: {
        status: dto.status,
        priority: dto.priority,
        clinicalNotes: dto.clinicalNotes,
        specialInstructions: dto.specialInstructions,
        scheduledDate: dto.scheduledDate
          ? new Date(dto.scheduledDate)
          : undefined,
        sampleCollectedAt: dto.sampleCollectedAt
          ? new Date(dto.sampleCollectedAt)
          : undefined,
      },
      include: {
        patient: true,
        test: true,
      },
    });

    return {
      statusCode: 200,
      message: "Lab order updated successfully",
      data: updated,
    };
  }

  /**
   * Collect sample for lab order
   */
  public static async collectSample(
    id: string,
    sampleType: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    const existing = await prisma.labOrder.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab order not found", 404);

    if (existing.status !== "PENDING" && existing.status !== "SCHEDULED") {
      throw new AppError("Sample already collected or order not ready", 409);
    }

    const updated = await prisma.labOrder.update({
      where: { id },
      data: {
        sampleType,
        sampleCollectedAt: new Date(),
        sampleCollectedBy: userId,
        status: "IN_PROGRESS",
      },
    });

    return {
      statusCode: 200,
      message: "Sample collected successfully",
      data: updated,
    };
  }

  /**
   * Cancel lab order
   */
  public static async cancel(
    id: string,
    req: Request
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.labOrder.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab order not found", 404);

    if (existing.status === "COMPLETED") {
      throw new AppError("Cannot cancel completed order", 409);
    }

    const updated = await prisma.labOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return {
      statusCode: 200,
      message: "Lab order cancelled successfully",
      data: updated,
    };
  }

  /**
   * Get pending lab requests
   */
  public static async getPendingRequests(
    req: Request
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pending = await prisma.labOrder.findMany({
      where: {
        companyId,
        status: { in: ["PENDING", "SCHEDULED"] },
      },
      orderBy: [{ priority: "desc" }, { orderedAt: "asc" }],
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
        test: true,
      },
    });

    return {
      statusCode: 200,
      message: "Pending lab requests fetched successfully",
      data: pending,
    };
  }

  /**
   * Get in-progress lab requests
   */
  public static async getInProgressRequests(
    req: Request
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const inProgress = await prisma.labOrder.findMany({
      where: {
        companyId,
        status: "IN_PROGRESS",
      },
      orderBy: { sampleCollectedAt: "asc" },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            patientNO: true,
          },
        },
        test: true,
        results: true,
      },
    });

    return {
      statusCode: 200,
      message: "In-progress lab requests fetched successfully",
      data: inProgress,
    };
  }

  /**
   * Delete lab order
   */
  public static async remove(
    id: string,
    req: Request
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.labOrder.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab order not found", 404);

    // Only allow deletion of pending orders
    if (existing.status !== "PENDING") {
      throw new AppError("Only pending orders can be deleted", 409);
    }

    await prisma.labOrder.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Lab order deleted successfully",
    };
  }
}
