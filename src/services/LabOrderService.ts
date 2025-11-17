import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import type {
  LabResultItem,
  CreateLabOrderDto,
  UpdateLabOrderDto,
} from "../utils/interfaces/common";

export type LabOrderStatus =
  | "ORDERED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export class LabOrderService {
  public static async list(
    page?: number,
    limit?: number,
    filters?: {
      patientId?: string;
      providerId?: string;
      encounterId?: string;
      status?: LabOrderStatus;
      pendingOnly?: boolean;
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
      prisma.labOrder.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
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

  public static async getById(id: string): Promise<IResponse<unknown>> {
    const record = await prisma.labOrder.findUnique({ where: { id } });
    if (!record) throw new AppError("Lab order not found", 404);
    return {
      statusCode: 200,
      message: "Lab order fetched successfully",
      data: record,
    };
  }

  public static async create(
    req: Request,
    dto: CreateLabOrderDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);
    const created = await prisma.labOrder.create({
      data: {
        patientId: dto.patientId,
        providerId: dto.providerId,
        encounterId: dto.encounterId,
        orderType: dto.orderType,
        tests: dto.tests as unknown as object[],
        status: "ORDERED",
        orderedDate: new Date(),
        specialInstructions: dto.specialInstructions,
        createdBy: userId,
      },
    });
    return { statusCode: 201, message: "Lab order created", data: created };
  }

  public static async update(
    id: string,
    dto: UpdateLabOrderDto,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.labOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Lab order not found", 404);
    const updated = await prisma.labOrder.update({
      where: { id },
      data: {
        tests:
          (dto.tests as unknown as object[]) ??
          (existing.tests as unknown as object[]),
        specialInstructions:
          dto.specialInstructions ?? existing.specialInstructions,
        status: dto.status ?? existing.status,
      },
    });
    return { statusCode: 200, message: "Lab order updated", data: updated };
  }

  public static async remove(id: string): Promise<IResponse<null>> {
    const existing = await prisma.labOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Lab order not found", 404);
    await prisma.labOrder.delete({ where: { id } });
    return { statusCode: 200, message: "Lab order deleted" };
  }

  public static async schedule(
    id: string,
    scheduledDate: string | Date,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.labOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Lab order not found", 404);
    if (existing.status !== "ORDERED") {
      throw new AppError("Only ORDERED lab orders can be scheduled", 409);
    }
    const date = new Date(scheduledDate);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new AppError("Invalid scheduledDate", 400);
    }
    if (date <= new Date()) {
      throw new AppError("scheduledDate must be in the future", 400);
    }
    const updated = await prisma.labOrder.update({
      where: { id },
      data: { status: "SCHEDULED", scheduledDate: date },
    });
    return { statusCode: 200, message: "Lab order scheduled", data: updated };
  }

  public static async collect(id: string): Promise<IResponse<unknown>> {
    const existing = await prisma.labOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Lab order not found", 404);
    if (!existing.scheduledDate) {
      throw new AppError("Cannot collect before scheduling", 409);
    }
    if (existing.status !== "SCHEDULED") {
      throw new AppError("Only SCHEDULED lab orders can be collected", 409);
    }
    const now = new Date();
    if (existing.scheduledDate > now) {
      throw new AppError("Cannot collect before scheduledDate", 409);
    }
    const updated = await prisma.labOrder.update({
      where: { id },
      data: { status: "IN_PROGRESS", collectedDate: now },
    });
    return { statusCode: 200, message: "Lab order collected", data: updated };
  }

  public static async complete(
    id: string,
    results: LabResultItem[] | undefined,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.labOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Lab order not found", 404);
    if (existing.status !== "IN_PROGRESS" && existing.status !== "SCHEDULED") {
      throw new AppError(
        "Only IN_PROGRESS or SCHEDULED orders can complete",
        409,
      );
    }
    const updated = await prisma.labOrder.update({
      where: { id },
      data: {
        status: "COMPLETED",
        results: (results ?? []) as unknown as object[],
        completedDate: new Date(),
      },
    });
    return { statusCode: 200, message: "Lab order completed", data: updated };
  }

  public static async cancel(id: string): Promise<IResponse<unknown>> {
    const existing = await prisma.labOrder.findUnique({ where: { id } });
    if (!existing) throw new AppError("Lab order not found", 404);
    if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
      throw new AppError("Lab order is already terminal", 409);
    }
    const updated = await prisma.labOrder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return { statusCode: 200, message: "Lab order cancelled", data: updated };
  }
}
