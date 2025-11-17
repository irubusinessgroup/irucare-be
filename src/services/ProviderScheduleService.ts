import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IResponse } from "../utils/interfaces/common";

export interface CreateScheduleDto {
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  isActive?: boolean;
}

export interface CreateScheduleBlockDto {
  startDate: string;
  endDate: string;
  reason?: string;
}

export class ProviderScheduleService {
  /**
   * Create or update provider schedule
   */
  public static async createOrUpdateSchedule(
    req: Request,
    providerId: string,
    schedules: CreateScheduleDto[],
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);

    // Validate provider exists
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    // Delete existing schedules for this provider
    await prisma.providerSchedule.deleteMany({
      where: { providerId },
    });

    // Create new schedules
    const created = await Promise.all(
      schedules.map((schedule) =>
        prisma.providerSchedule.create({
          data: {
            providerId,
            dayOfWeek: schedule.dayOfWeek,
            startTime: new Date(`1970-01-01T${schedule.startTime}:00`),
            endTime: new Date(`1970-01-01T${schedule.endTime}:00`),
            isActive: schedule.isActive ?? true,
          },
        }),
      ),
    );

    return {
      statusCode: 201,
      message: "Provider schedule created successfully",
      data: created,
    };
  }

  /**
   * Get provider schedule
   */
  public static async getSchedule(
    providerId: string,
  ): Promise<IResponse<unknown>> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    const schedules = await prisma.providerSchedule.findMany({
      where: { providerId, isActive: true },
      orderBy: { dayOfWeek: "asc" },
    });

    return {
      statusCode: 200,
      message: "Provider schedule retrieved successfully",
      data: {
        provider: {
          id: provider.id,
          name: provider.name,
          email: provider.email,
        },
        schedules,
      },
    };
  }

  /**
   * Block time slots for provider
   */
  public static async blockTime(
    req: Request,
    providerId: string,
    dto: CreateScheduleBlockDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    if (!userId) throw new AppError("Not Authorized", 401);

    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate <= startDate) {
      throw new AppError("End date must be after start date", 400);
    }

    const block = await prisma.providerScheduleBlock.create({
      data: {
        providerId,
        startDate,
        endDate,
        reason: dto.reason,
      },
    });

    return {
      statusCode: 201,
      message: "Time block created successfully",
      data: block,
    };
  }

  /**
   * Remove time block
   */
  public static async removeBlock(blockId: string): Promise<IResponse<null>> {
    const block = await prisma.providerScheduleBlock.findUnique({
      where: { id: blockId },
    });

    if (!block) {
      throw new AppError("Time block not found", 404);
    }

    await prisma.providerScheduleBlock.delete({
      where: { id: blockId },
    });

    return {
      statusCode: 200,
      message: "Time block removed successfully",
    };
  }

  /**
   * Get all time blocks for a provider
   */
  public static async getBlocks(
    providerId: string,
  ): Promise<IResponse<unknown[]>> {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    const blocks = await prisma.providerScheduleBlock.findMany({
      where: { providerId },
      orderBy: { startDate: "asc" },
    });

    return {
      statusCode: 200,
      message: "Time blocks retrieved successfully",
      data: blocks,
    };
  }
}
