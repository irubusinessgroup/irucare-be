import type { Request } from "express";
import { prisma } from "../utils/client";
import type { IPaged } from "../utils/interfaces/common";
import { Prisma } from "@prisma/client";

export interface CreateAuditLogDto {
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "VIEW";
  changes?: {
    before?: unknown;
    after?: unknown;
  };
  ipAddress?: string;
  userAgent?: string;
}

export class AuditLogService {
  /**
   * Log an action
   */
  public static async logAction(
    req: Request,
    dto: CreateAuditLogDto,
  ): Promise<void> {
    const userId = req.user?.id;
    const ipAddress =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      undefined;
    const userAgent = req.headers["user-agent"] || undefined;

    try {
      await prisma.auditLog.create({
        data: {
          userId: userId || undefined,
          entityType: dto.entityType,
          entityId: dto.entityId,
          action: dto.action,
          changes: dto.changes
            ? JSON.parse(JSON.stringify(dto.changes))
            : Prisma.JsonNull,
          ipAddress: (ipAddress as string) || dto.ipAddress,
          userAgent: userAgent || dto.userAgent,
        },
      });
    } catch (error) {
      // Don't throw - audit logging should not break the main flow
      console.error("Error creating audit log:", error);
    }
  }

  /**
   * Get audit logs with filtering
   */
  public static async getLogs(
    page?: number,
    limit?: number,
    filters?: {
      entityType?: string;
      entityId?: string;
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.AuditLogWhereInput = {};
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = filters.action;

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const [data, totalItems] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Audit logs retrieved successfully",
    };
  }

  /**
   * Get all audit logs for a patient
   */
  public static async getPatientLogs(
    patientId: string,
    page?: number,
    limit?: number,
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    // Get all entity IDs related to this patient
    const [appointments, encounters, prescriptions, labOrders, billings] =
      await Promise.all([
        prisma.appointment.findMany({
          where: { patientId },
          select: { id: true },
        }),
        prisma.encounter.findMany({
          where: { patientId },
          select: { id: true },
        }),
        prisma.prescription.findMany({
          where: { patientId },
          select: { id: true },
        }),
        prisma.labOrder.findMany({
          where: { patientId },
          select: { id: true },
        }),
        prisma.clinicBilling.findMany({
          where: { patientId },
          select: { id: true },
        }),
      ]);

    const entityIds = [
      ...appointments.map((a) => ({ type: "APPOINTMENT", id: a.id })),
      ...encounters.map((e) => ({ type: "ENCOUNTER", id: e.id })),
      ...prescriptions.map((p) => ({ type: "PRESCRIPTION", id: p.id })),
      ...labOrders.map((l) => ({ type: "LAB_ORDER", id: l.id })),
      ...billings.map((b) => ({ type: "BILLING", id: b.id })),
    ];

    // Get audit logs for all these entities
    const where = {
      OR: entityIds.map((e) => ({
        entityType: e.type,
        entityId: e.id,
      })),
    };

    const [data, totalItems] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Patient audit logs retrieved successfully",
    };
  }
}
