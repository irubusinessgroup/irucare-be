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

    // Validate provider exists and belongs to user's company
    const provider = await prisma.provider.findFirst({
      where: {
        id: providerId,
        companyId: req.user?.company?.companyId,
      },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    // Use transaction to update all schedules
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing schedules for this provider
      await tx.providerSchedule.deleteMany({
        where: { providerId },
      });

      // Create new schedules
      const createdSchedules = await Promise.all(
        schedules.map((schedule) =>
          tx.providerSchedule.create({
            data: {
              providerId,
              dayOfWeek: schedule.dayOfWeek,
              startTime: schedule.startTime, // Store as string "HH:mm"
              endTime: schedule.endTime, // Store as string "HH:mm"
              isActive: schedule.isActive ?? true,
            },
          }),
        ),
      );

      return createdSchedules;
    });

    return {
      statusCode: 200,
      message: "Provider schedule updated successfully",
      data: { schedules: result },
    };
  }

  /**
   * Get provider schedule
   */
  public static async getSchedule(
    providerId: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId as string;

    const provider = await prisma.provider.findFirst({
      where: {
        id: providerId,
        companyId,
      },
    });

    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    const schedules = await prisma.providerSchedule.findMany({
      where: { providerId },
      orderBy: { dayOfWeek: "asc" },
    });

    return {
      statusCode: 200,
      message: "Provider schedule retrieved successfully",
      data: { schedules }, // Wrap in data object
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
