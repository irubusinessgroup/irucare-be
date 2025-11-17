import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import type {
  CreateEncounterDto,
  UpdateEncounterDto,
} from "../utils/interfaces/common";

export type EncounterStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export class EncounterService {
  public static async list(
    req: Request,
    page?: number,
    limit?: number,
    filters?: {
      patientId?: string;
      providerId?: string;
      appointmentId?: string;
      status?: EncounterStatus;
      start?: string;
      end?: string;
    },
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;
    const dateWhere =
      filters?.start || filters?.end
        ? {
            createdAt: {
              gte: filters?.start ? new Date(filters.start) : undefined,
              lte: filters?.end ? new Date(filters.end) : undefined,
            },
          }
        : {};

    const where = {
      patientId: filters?.patientId || undefined,
      providerId: filters?.providerId || undefined,
      appointmentId: filters?.appointmentId || undefined,
      status: filters?.status || undefined,
      ...dateWhere,
    };

    const [data, totalItems] = await Promise.all([
      prisma.encounter.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
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

  public static async getById(id: string): Promise<IResponse<unknown>> {
    const encounter = await prisma.encounter.findUnique({ where: { id } });
    if (!encounter) {
      throw new AppError("Encounter not found", 404);
    }
    return {
      statusCode: 200,
      message: "Encounter fetched successfully",
      data: encounter,
    };
  }

  public static async create(
    req: Request,
    dto: CreateEncounterDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);
    const created = await prisma.encounter.create({
      data: {
        patientId: dto.patientId,
        providerId: dto.providerId,
        appointmentId: dto.appointmentId,
        notes: dto.notes,
        status: "IN_PROGRESS",
        createdBy: userId,
      },
    });
    return { statusCode: 201, message: "Encounter created", data: created };
  }

  public static async update(
    id: string,
    dto: UpdateEncounterDto,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.encounter.findUnique({ where: { id } });
    if (!existing) throw new AppError("Encounter not found", 404);
    if (existing.status !== "IN_PROGRESS") {
      throw new AppError("Cannot update a terminal encounter", 409);
    }
    const updated = await prisma.encounter.update({
      where: { id },
      data: { notes: dto.notes },
    });
    return { statusCode: 200, message: "Encounter updated", data: updated };
  }

  public static async remove(id: string): Promise<IResponse<null>> {
    const existing = await prisma.encounter.findUnique({ where: { id } });
    if (!existing) throw new AppError("Encounter not found", 404);
    await prisma.encounter.delete({ where: { id } });
    return { statusCode: 200, message: "Encounter deleted" };
  }

  public static async complete(id: string): Promise<IResponse<unknown>> {
    const enc = await prisma.encounter.findUnique({ where: { id } });
    if (!enc) throw new AppError("Encounter not found", 404);
    if (enc.status === "CANCELLED" || enc.status === "COMPLETED") {
      throw new AppError("Encounter is already in a terminal state", 409);
    }
    const updated = await prisma.encounter.update({
      where: { id },
      data: { status: "COMPLETED" },
    });
    return { statusCode: 200, message: "Encounter completed", data: updated };
  }

  public static async cancel(id: string): Promise<IResponse<unknown>> {
    const enc = await prisma.encounter.findUnique({ where: { id } });
    if (!enc) throw new AppError("Encounter not found", 404);
    if (enc.status === "CANCELLED" || enc.status === "COMPLETED") {
      throw new AppError("Encounter is already in a terminal state", 409);
    }
    const updated = await prisma.encounter.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    return { statusCode: 200, message: "Encounter cancelled", data: updated };
  }
}
