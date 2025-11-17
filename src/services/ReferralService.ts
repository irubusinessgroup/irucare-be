import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import { NotificationHelper } from "../utils/notificationHelper";
import { Server as SocketIOServer } from "socket.io";

export interface CreateReferralDto {
  patientId: string;
  encounterId?: string;
  referringProviderId: string;
  referredToProviderId: string;
  referralType?: string;
  reason: string;
  priority?: string;
}

export interface UpdateReferralDto {
  referralType?: string;
  reason?: string;
  priority?: string;
  status?: string;
  appointmentDate?: string;
  responseNotes?: string;
}

export class ReferralService {
  public static async list(
    page?: number,
    limit?: number,
    filters?: {
      patientId?: string;
      encounterId?: string;
      referringProviderId?: string;
      referredToProviderId?: string;
      status?: string;
    },
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (filters?.patientId) where.patientId = filters.patientId;
    if (filters?.encounterId) where.encounterId = filters.encounterId;
    if (filters?.referringProviderId)
      where.referringProviderId = filters.referringProviderId;
    if (filters?.referredToProviderId)
      where.referredToProviderId = filters.referredToProviderId;
    if (filters?.status) where.status = filters.status;

    const [data, totalItems] = await Promise.all([
      prisma.referral.findMany({
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
          encounter: {
            select: {
              id: true,
              status: true,
            },
          },
          referringProvider: {
            select: {
              id: true,
              name: true,
              email: true,
              specialty: true,
            },
          },
          referredToProvider: {
            select: {
              id: true,
              name: true,
              email: true,
              specialty: true,
            },
          },
        },
      }),
      prisma.referral.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Referrals fetched successfully",
    };
  }

  public static async getById(id: string): Promise<IResponse<unknown>> {
    const referral = await prisma.referral.findUnique({
      where: { id },
      include: {
        patient: true,
        encounter: true,
        referringProvider: true,
        referredToProvider: true,
      },
    });

    if (!referral) {
      throw new AppError("Referral not found", 404);
    }

    return {
      statusCode: 200,
      message: "Referral fetched successfully",
      data: referral,
    };
  }

  public static async create(
    req: Request,
    dto: CreateReferralDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);

    // Validate providers exist
    const [referringProvider, referredToProvider] = await Promise.all([
      prisma.provider.findUnique({
        where: { id: dto.referringProviderId },
      }),
      prisma.provider.findUnique({
        where: { id: dto.referredToProviderId },
      }),
    ]);

    if (!referringProvider) {
      throw new AppError("Referring provider not found", 404);
    }

    if (!referredToProvider) {
      throw new AppError("Referred-to provider not found", 404);
    }

    const created = await prisma.referral.create({
      data: {
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        referringProviderId: dto.referringProviderId,
        referredToProviderId: dto.referredToProviderId,
        referralType: dto.referralType,
        reason: dto.reason,
        priority: dto.priority ?? "ROUTINE",
        status: "PENDING",
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
        referringProvider: {
          select: {
            id: true,
            name: true,
          },
        },
        referredToProvider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Send notification to referred-to provider
    try {
      const io = req.app.get("io") as SocketIOServer;
      await NotificationHelper.sendToUser(
        io,
        referredToProvider.id,
        "New Referral Received",
        `You have received a new referral for patient ${created.patient.name} from ${created.referringProvider.name}`,
        "info",
        `/referrals/${created.id}`,
        "referral",
        created.id,
      );
    } catch (error) {
      console.error("Error sending referral notification:", error);
    }

    return {
      statusCode: 201,
      message: "Referral created successfully",
      data: created,
    };
  }

  public static async update(
    id: string,
    dto: UpdateReferralDto,
  ): Promise<IResponse<unknown>> {
    const existing = await prisma.referral.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError("Referral not found", 404);
    }

    const updated = await prisma.referral.update({
      where: { id },
      data: {
        referralType: dto.referralType ?? existing.referralType,
        reason: dto.reason ?? existing.reason,
        priority: dto.priority ?? existing.priority,
        status: dto.status ?? existing.status,
        appointmentDate: dto.appointmentDate
          ? new Date(dto.appointmentDate)
          : existing.appointmentDate,
        responseNotes: dto.responseNotes ?? existing.responseNotes,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
        referringProvider: {
          select: {
            id: true,
            name: true,
          },
        },
        referredToProvider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Referral updated successfully",
      data: updated,
    };
  }

  public static async remove(id: string): Promise<IResponse<null>> {
    const existing = await prisma.referral.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError("Referral not found", 404);
    }

    if (existing.status === "COMPLETED") {
      throw new AppError("Cannot delete completed referrals", 409);
    }

    await prisma.referral.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Referral deleted successfully",
    };
  }

  public static async accept(
    req: Request,
    id: string,
    appointmentDate?: string,
  ): Promise<IResponse<unknown>> {
    const referral = await prisma.referral.findUnique({
      where: { id },
    });

    if (!referral) {
      throw new AppError("Referral not found", 404);
    }

    if (referral.status !== "PENDING") {
      throw new AppError("Only PENDING referrals can be accepted", 409);
    }

    const updated = await prisma.referral.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        appointmentDate: appointmentDate
          ? new Date(appointmentDate)
          : referral.appointmentDate,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
        referringProvider: {
          select: {
            id: true,
            name: true,
          },
        },
        referredToProvider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Send notification to referring provider
    try {
      const io = req.app.get("io") as SocketIOServer;
      await NotificationHelper.sendToUser(
        io,
        referral.referringProviderId,
        "Referral Accepted",
        `Your referral for patient ${updated.patient.name} has been accepted by ${updated.referredToProvider.name}`,
        "success",
        `/referrals/${id}`,
        "referral",
        id,
      );
    } catch (error) {
      console.error("Error sending referral notification:", error);
    }

    return {
      statusCode: 200,
      message: "Referral accepted successfully",
      data: updated,
    };
  }

  public static async complete(
    req: Request,
    id: string,
    responseNotes?: string,
    followUpEncounterId?: string,
  ): Promise<IResponse<unknown>> {
    const referral = await prisma.referral.findUnique({
      where: { id },
    });

    if (!referral) {
      throw new AppError("Referral not found", 404);
    }

    if (referral.status === "COMPLETED" || referral.status === "CANCELLED") {
      throw new AppError(`Cannot complete ${referral.status} referral`, 409);
    }

    const updated = await prisma.referral.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedDate: new Date(),
        responseNotes: responseNotes ?? referral.responseNotes,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
          },
        },
        referringProvider: {
          select: {
            id: true,
            name: true,
          },
        },
        referredToProvider: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Send notification to referring provider
    try {
      const io = req.app.get("io") as SocketIOServer;
      await NotificationHelper.sendToUser(
        io,
        referral.referringProviderId,
        "Referral Completed",
        `The referral for patient ${updated.patient.name} has been completed by ${updated.referredToProvider.name}`,
        "success",
        `/referrals/${id}`,
        "referral",
        id,
      );
    } catch (error) {
      console.error("Error sending referral notification:", error);
    }

    return {
      statusCode: 200,
      message: "Referral completed successfully",
      data: updated,
    };
  }
}
