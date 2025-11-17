import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import type {
  CreateEMRDto,
  UpdateEMRDto,
  EMRRecordType,
} from "../utils/interfaces/common";
import type { Prisma } from "@prisma/client";

export class EMRService {
  public static async list(
    page?: number,
    limit?: number,
    filters?: {
      patientId?: string;
      encounterId?: string;
      recordType?: EMRRecordType;
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
      encounterId: filters?.encounterId || undefined,
      recordType: filters?.recordType || undefined,
      ...dateWhere,
    };
    const [data, totalItems] = await Promise.all([
      prisma.eMR.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.eMR.count({ where }),
    ]);
    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "EMR entries fetched successfully",
    };
  }

  public static async getById(id: string): Promise<IResponse<unknown>> {
    const emr = await prisma.eMR.findUnique({ where: { id } });
    if (!emr) throw new AppError("EMR not found", 404);
    return { statusCode: 200, message: "EMR fetched successfully", data: emr };
  }

  public static async create(
    req: Request,
    dto: CreateEMRDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);
    const created = await prisma.eMR.create({
      data: {
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        recordType: dto.recordType,
        title: dto.title,
        content: dto.content,
        data:
          dto.data === undefined
            ? undefined
            : (dto.data as unknown as Prisma.InputJsonValue),
        isConfidential: Boolean(dto.isConfidential),
        createdBy: userId,
      },
    });
    return { statusCode: 201, message: "EMR created", data: created };
  }

  public static async update(
    id: string,
    dto: UpdateEMRDto,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.eMR.findUnique({ where: { id } });
    if (!existing) throw new AppError("EMR not found", 404);
    const updated = await prisma.eMR.update({
      where: { id },
      data: {
        title: dto.title,
        content: dto.content,
        data:
          dto.data === undefined
            ? undefined
            : (dto.data as unknown as Prisma.InputJsonValue),
        isConfidential: dto.isConfidential ?? existing.isConfidential,
      },
    });
    return { statusCode: 200, message: "EMR updated", data: updated };
  }

  public static async remove(id: string): Promise<IResponse<null>> {
    const existing = await prisma.eMR.findUnique({ where: { id } });
    if (!existing) throw new AppError("EMR not found", 404);
    await prisma.eMR.delete({ where: { id } });
    return { statusCode: 200, message: "EMR deleted" };
  }

  public static async listByPatient(
    patientId: string,
    page?: number,
    limit?: number,
  ): Promise<IPaged<unknown[]>> {
    return this.list(page, limit, { patientId });
  }

  public static async listByEncounter(
    encounterId: string,
    page?: number,
    limit?: number,
  ): Promise<IPaged<unknown[]>> {
    return this.list(page, limit, { encounterId });
  }

  public static async timeline(
    patientId: string,
  ): Promise<IResponse<unknown[]>> {
    const entries = await prisma.eMR.findMany({
      where: { patientId },
      orderBy: { createdAt: "asc" },
    });
    return { statusCode: 200, message: "Timeline fetched", data: entries };
  }
}
