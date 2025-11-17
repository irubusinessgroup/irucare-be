import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  AppointmentFilters,
  TAppointment,
  IResponse,
  IPaged,
  AvailableTimeSlot,
  AppointmentStatistics,
  RescheduleAppointmentDto,
  CancelAppointmentDto,
  CompleteAppointmentDto,
  NoShowAppointmentDto,
  AppointmentStatus,
  AppointmentType,
} from "../utils/interfaces/common";
import { NotificationHelper } from "../utils/notificationHelper";
import { Server as SocketIOServer } from "socket.io";
import type { Prisma } from "@prisma/client";

export class AppointmentService {
  // Create appointment
  public static async createAppointment(
    data: CreateAppointmentDto,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    const companyId = req.user?.company?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    // Validate required fields
    if (
      !data.patientId ||
      !data.providerId ||
      !data.appointmentType ||
      !data.scheduledDate ||
      !data.duration ||
      !data.reason
    ) {
      throw new AppError("Missing required fields", 400);
    }

    // Check if patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: data.patientId, companyId },
    });
    if (!patient) {
      throw new AppError("Patient not found", 404);
    }

    // Check if provider exists and is available
    const provider = await prisma.provider.findFirst({
      where: { id: data.providerId, companyId },
    });
    if (!provider) {
      throw new AppError("Provider not found", 404);
    }

    // Check for time conflicts
    const conflict = await this.checkTimeConflict(
      data.providerId,
      new Date(data.scheduledDate),
      data.duration,
      companyId
    );
    if (conflict) {
      throw new AppError("Time slot conflict", 409);
    }

    // Create appointment
    const appointment = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        providerId: data.providerId,
        companyId,
        appointmentType: data.appointmentType,
        status: "SCHEDULED",
        scheduledDate: new Date(data.scheduledDate),
        duration: data.duration,
        reason: data.reason,
        notes: data.notes,
        room: data.room,
        createdBy: userId,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Send notification
    const io = req.app.get("io") as SocketIOServer;
    await this.sendAppointmentNotification(
      io,
      appointment,
      "APPOINTMENT_SCHEDULED"
    );

    return {
      statusCode: 201,
      message: "Appointment created successfully",
      data: appointment,
    };
  }

  // Get all appointments with filtering and pagination
  public static async getAllAppointments(
    req: Request,
    filters: AppointmentFilters
  ): Promise<IPaged<TAppointment[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const {
      page = 1,
      limit = 10,
      searchq,
      patientId,
      providerId,
      appointmentType,
      status,
      startDate,
      endDate,
    } = filters;

    const whereClause: Prisma.AppointmentWhereInput = { companyId };

    if (searchq) {
      whereClause.OR = [
        { reason: { contains: searchq } },
        { notes: { contains: searchq } },
        { room: { contains: searchq } },
        { patient: { name: { contains: searchq } } },
        { provider: { name: { contains: searchq } } },
      ];
    }

    if (patientId) whereClause.patientId = patientId;
    if (providerId) whereClause.providerId = providerId;
    if (appointmentType) whereClause.appointmentType = appointmentType;
    if (status) whereClause.status = status;

    if (startDate || endDate) {
      whereClause.scheduledDate = {};
      if (startDate) whereClause.scheduledDate.gte = new Date(startDate);
      if (endDate) whereClause.scheduledDate.lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const take = limit;

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      skip,
      take,
      orderBy: { scheduledDate: "desc" },
    });

    const totalItems = await prisma.appointment.count({ where: whereClause });

    return {
      data: appointments,
      totalItems,
      currentPage: page,
      itemsPerPage: limit,
      statusCode: 200,
      message: "Appointments retrieved successfully",
    };
  }

  // Get appointment by ID
  public static async getAppointmentById(
    id: string,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    return {
      statusCode: 200,
      message: "Appointment retrieved successfully",
      data: appointment,
    };
  }

  // Update appointment
  public static async updateAppointment(
    id: string,
    data: UpdateAppointmentDto,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingAppointment = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!existingAppointment) {
      throw new AppError("Appointment not found", 404);
    }

    // Check for time conflicts if scheduledDate or duration is being updated
    if (data.scheduledDate || data.duration) {
      const scheduledDate = data.scheduledDate
        ? new Date(data.scheduledDate)
        : existingAppointment.scheduledDate;
      const duration = data.duration || existingAppointment.duration;

      const conflict = await this.checkTimeConflict(
        existingAppointment.providerId,
        scheduledDate,
        duration,
        companyId,
        id // exclude current appointment
      );
      if (conflict) {
        throw new AppError("Time slot conflict", 409);
      }
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...(data.appointmentType && { appointmentType: data.appointmentType }),
        ...(data.scheduledDate && {
          scheduledDate: new Date(data.scheduledDate),
        }),
        ...(data.duration && { duration: data.duration }),
        ...(data.reason && { reason: data.reason }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.room !== undefined && { room: data.room }),
        ...(data.status && { status: data.status }),
        ...(data.cancellationReason && {
          cancellationReason: data.cancellationReason,
        }),
        ...(data.encounterId && { encounterId: data.encounterId }),
        updatedAt: new Date(),
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Appointment updated successfully",
      data: appointment,
    };
  }

  // Delete appointment (soft delete by updating status)
  public static async deleteAppointment(
    id: string,
    req: Request
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    await prisma.appointment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: "Deleted by user",
        updatedAt: new Date(),
      },
    });

    return {
      statusCode: 200,
      message: "Appointment deleted successfully",
    };
  }

  // Confirm appointment
  public static async confirmAppointment(
    id: string,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    return this.updateAppointmentStatus(
      id,
      "CONFIRMED",
      { confirmedAt: new Date() },
      req
    );
  }

  // Cancel appointment
  public static async cancelAppointment(
    id: string,
    data: CancelAppointmentDto,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    return this.updateAppointmentStatus(
      id,
      "CANCELLED",
      {
        cancelledAt: new Date(),
        cancellationReason: data.reason,
      },
      req
    );
  }

  // Reschedule appointment
  public static async rescheduleAppointment(
    id: string,
    data: RescheduleAppointmentDto,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    // Check for time conflicts with new date
    const conflict = await this.checkTimeConflict(
      appointment.providerId,
      new Date(data.newDate),
      appointment.duration,
      companyId,
      id
    );
    if (conflict) {
      throw new AppError("Time slot conflict", 409);
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        scheduledDate: new Date(data.newDate),
        status: "RESCHEDULED",
        notes: data.reason
          ? `${appointment.notes || ""}\nRescheduled: ${data.reason}`.trim()
          : appointment.notes,
        updatedAt: new Date(),
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Send notification
    const io = req.app.get("io") as SocketIOServer;
    await this.sendAppointmentNotification(
      io,
      updatedAppointment,
      "APPOINTMENT_RESCHEDULED"
    );

    return {
      statusCode: 200,
      message: "Appointment rescheduled successfully",
      data: updatedAppointment,
    };
  }

  // Complete appointment
  public static async completeAppointment(
    id: string,
    data: CompleteAppointmentDto,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    return this.updateAppointmentStatus(
      id,
      "COMPLETED",
      {
        completedAt: new Date(),
        encounterId: data.encounterId,
        notes: data.notes
          ? `${req.body.notes || ""}\nCompleted: ${data.notes}`.trim()
          : req.body.notes,
      },
      req
    );
  }

  // Mark as no-show
  public static async markNoShow(
    id: string,
    data: NoShowAppointmentDto,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    return this.updateAppointmentStatus(
      id,
      "NO_SHOW",
      {
        noShowAt: new Date(),
        notes: data.notes
          ? `${req.body.notes || ""}\nNo-show: ${data.notes}`.trim()
          : req.body.notes,
      },
      req
    );
  }

  // Get available time slots
  public static async getAvailableTimeSlots(
    providerId: string,
    date: string,
    duration: number = 30,
    req: Request
  ): Promise<IResponse<AvailableTimeSlot[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    // First try to get from ProviderSchedule (new system)
    const schedule = await prisma.providerSchedule.findFirst({
      where: {
        providerId,
        dayOfWeek,
        isActive: true,
      },
    });

    // Fallback to ProviderAvailability (legacy system)
    let timeRange: { startTime: Date; endTime: Date } | null = null;

    if (schedule) {
      timeRange = {
        startTime: schedule.startTime,
        endTime: schedule.endTime,
      };
    } else {
      const availability = await prisma.providerAvailability.findFirst({
        where: {
          providerId,
          companyId,
          dayOfWeek,
          isAvailable: true,
        },
      });

      if (!availability) {
        return {
          statusCode: 200,
          message: "No availability found for this day",
          data: [],
        };
      }

      timeRange = {
        startTime: availability.startTime,
        endTime: availability.endTime,
      };
    }

    // Check for blocked time slots
    const blocks = await prisma.providerScheduleBlock.findMany({
      where: {
        providerId,
        startDate: { lte: new Date(`${date}T23:59:59`) },
        endDate: { gte: new Date(`${date}T00:00:00`) },
      },
    });

    // Generate time slots
    const slots: AvailableTimeSlot[] = [];
    const startTime = new Date(
      `${date}T${timeRange.startTime.toTimeString().slice(0, 8)}`
    );
    const endTime = new Date(
      `${date}T${timeRange.endTime.toTimeString().slice(0, 8)}`
    );

    let currentTime = new Date(startTime);

    while (currentTime < endTime) {
      const slotEndTime = new Date(currentTime.getTime() + duration * 60000);

      if (slotEndTime <= endTime) {
        // Check if this slot is blocked
        const isBlocked = blocks.some(
          (block) =>
            currentTime >= block.startDate && currentTime < block.endDate
        );

        if (!isBlocked) {
          // Check if this slot conflicts with existing appointments
          const isAvailable = await this.checkTimeSlotAvailability(
            providerId,
            currentTime,
            duration,
            companyId
          );

          slots.push({
            time: currentTime.toTimeString().slice(0, 5),
            available: isAvailable,
          });
        } else {
          slots.push({
            time: currentTime.toTimeString().slice(0, 5),
            available: false,
          });
        }
      }

      currentTime = new Date(currentTime.getTime() + 15 * 60000); // 15-minute intervals
    }

    return {
      statusCode: 200,
      message: "Available time slots retrieved successfully",
      data: slots,
    };
  }

  // Get today's appointments
  public static async getTodayAppointments(
    req: Request,
    providerId?: string
  ): Promise<IResponse<TAppointment[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const whereClause: Prisma.AppointmentWhereInput = {
      companyId,
      scheduledDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    if (providerId) {
      whereClause.providerId = providerId;
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return {
      statusCode: 200,
      message: "Today's appointments retrieved successfully",
      data: appointments,
    };
  }

  // Get upcoming appointments
  public static async getUpcomingAppointments(
    req: Request,
    days: number = 7
  ): Promise<IResponse<TAppointment[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        companyId,
        scheduledDate: {
          gte: now,
          lte: futureDate,
        },
        status: {
          in: ["SCHEDULED", "CONFIRMED"],
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return {
      statusCode: 200,
      message: "Upcoming appointments retrieved successfully",
      data: appointments,
    };
  }

  // Get appointment statistics
  public static async getAppointmentStatistics(
    req: Request,
    startDate?: string,
    endDate?: string,
    providerId?: string,
    appointmentType?: AppointmentType
  ): Promise<IResponse<AppointmentStatistics>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause: Prisma.AppointmentWhereInput = { companyId };

    if (startDate || endDate) {
      whereClause.scheduledDate = {};
      if (startDate) whereClause.scheduledDate.gte = new Date(startDate);
      if (endDate) whereClause.scheduledDate.lte = new Date(endDate);
    }

    if (providerId) whereClause.providerId = providerId;
    if (appointmentType) whereClause.appointmentType = appointmentType;

    const [
      totalAppointments,
      appointmentsByStatus,
      appointmentsByType,
      averageDuration,
      noShowCount,
      monthlyTrends,
      providerStats,
    ] = await Promise.all([
      prisma.appointment.count({ where: whereClause }),
      this.getAppointmentsByStatus(whereClause),
      this.getAppointmentsByType(whereClause),
      this.getAverageAppointmentDuration(whereClause),
      prisma.appointment.count({
        where: { ...whereClause, status: "NO_SHOW" },
      }),
      this.getMonthlyTrends(whereClause),
      this.getProviderStatistics(whereClause),
    ]);

    const noShowRate =
      totalAppointments > 0 ? noShowCount / totalAppointments : 0;

    return {
      statusCode: 200,
      message: "Appointment statistics retrieved successfully",
      data: {
        totalAppointments,
        appointmentsByStatus,
        appointmentsByType,
        averageAppointmentDuration: averageDuration,
        noShowRate,
        monthlyTrends,
        providerStatistics: providerStats,
      },
    };
  }

  // Private helper methods
  private static async checkTimeConflict(
    providerId: string,
    scheduledDate: Date,
    duration: number,
    companyId: string,
    excludeAppointmentId?: string
  ): Promise<boolean> {
    const startTime = new Date(scheduledDate);
    const endTime = new Date(startTime.getTime() + duration * 60000);

    const whereClause: Prisma.AppointmentWhereInput = {
      providerId,
      companyId,
      status: {
        in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"],
      },
      OR: [
        {
          scheduledDate: {
            gte: startTime,
            lt: endTime,
          },
        },
        {
          AND: [
            {
              scheduledDate: {
                lt: startTime,
              },
            },
            {
              scheduledDate: {
                gte: new Date(startTime.getTime() - 24 * 60 * 60 * 1000), // Check within 24 hours
              },
            },
          ],
        },
      ],
    };

    if (excludeAppointmentId) {
      whereClause.id = { not: excludeAppointmentId };
    }

    const conflict = await prisma.appointment.findFirst({
      where: whereClause,
    });

    return !!conflict;
  }

  private static async checkTimeSlotAvailability(
    providerId: string,
    startTime: Date,
    duration: number,
    companyId: string
  ): Promise<boolean> {
    const endTime = new Date(startTime.getTime() + duration * 60000);

    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId,
        companyId,
        status: {
          in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"],
        },
        OR: [
          {
            scheduledDate: {
              gte: startTime,
              lt: endTime,
            },
          },
          {
            AND: [
              {
                scheduledDate: {
                  lt: startTime,
                },
              },
              {
                scheduledDate: {
                  gte: new Date(startTime.getTime() - 24 * 60 * 60 * 1000),
                },
              },
            ],
          },
        ],
      },
    });

    return !conflict;
  }

  private static async updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    additionalData: Record<string, unknown>,
    req: Request
  ): Promise<IResponse<TAppointment>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    // Validate status transition
    const validTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      SCHEDULED: ["CONFIRMED", "CANCELLED", "RESCHEDULED"],
      CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
      IN_PROGRESS: ["COMPLETED", "CANCELLED"],
      CANCELLED: [],
      NO_SHOW: [],
      COMPLETED: [],
      RESCHEDULED: ["CONFIRMED", "CANCELLED"],
    };

    if (!validTransitions[appointment.status].includes(status)) {
      throw new AppError(
        `Invalid status transition from ${appointment.status} to ${status}`,
        400
      );
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        status,
        ...additionalData,
        updatedAt: new Date(),
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Send notification
    const io = req.app.get("io") as SocketIOServer;
    await this.sendAppointmentNotification(
      io,
      updatedAppointment,
      `APPOINTMENT_${status}`
    );

    return {
      statusCode: 200,
      message: `Appointment ${status.toLowerCase()} successfully`,
      data: updatedAppointment,
    };
  }

  private static async sendAppointmentNotification(
    io: SocketIOServer,
    appointment: TAppointment,
    notificationType: string
  ): Promise<void> {
    try {
      // Send to patient
      await NotificationHelper.sendToUser(
        io,
        appointment.patientId,
        `Appointment ${notificationType.replace("APPOINTMENT_", "").toLowerCase()}`,
        `Your appointment with ${appointment.provider?.name}  has been ${notificationType.replace("APPOINTMENT_", "").toLowerCase()}`,
        "info",
        `/appointments/${appointment.id}`,
        "appointment",
        appointment.id
      );

      // Send to provider
      await NotificationHelper.sendToUser(
        io,
        appointment.providerId,
        `Appointment ${notificationType.replace("APPOINTMENT_", "").toLowerCase()}`,
        `Appointment with ${appointment.patient?.name} has been ${notificationType.replace("APPOINTMENT_", "").toLowerCase()}`,
        "info",
        `/appointments/${appointment.id}`,
        "appointment",
        appointment.id
      );
    } catch (error) {
      console.error("Error sending appointment notification:", error);
    }
  }

  private static async getAppointmentsByStatus(
    whereClause: Prisma.AppointmentWhereInput
  ): Promise<Record<AppointmentStatus, number>> {
    const statuses = await prisma.appointment.groupBy({
      by: ["status"],
      where: whereClause,
      _count: { status: true },
    });

    const result: Record<AppointmentStatus, number> = {
      SCHEDULED: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
      RESCHEDULED: 0,
    };

    statuses.forEach((status) => {
      result[status.status as AppointmentStatus] = status._count.status;
    });

    return result;
  }

  private static async getAppointmentsByType(
    whereClause: Prisma.AppointmentWhereInput
  ): Promise<Record<AppointmentType, number>> {
    const types = await prisma.appointment.groupBy({
      by: ["appointmentType"],
      where: whereClause,
      _count: { appointmentType: true },
    });

    const result: Record<AppointmentType, number> = {
      CONSULTATION: 0,
      FOLLOW_UP: 0,
      ROUTINE_CHECKUP: 0,
      SPECIALIST: 0,
      EMERGENCY: 0,
      PROCEDURE: 0,
      VACCINATION: 0,
    };

    types.forEach((type) => {
      result[type.appointmentType as AppointmentType] =
        type._count.appointmentType;
    });

    return result;
  }

  private static async getAverageAppointmentDuration(
    whereClause: Prisma.AppointmentWhereInput
  ): Promise<number> {
    const result = await prisma.appointment.aggregate({
      where: whereClause,
      _avg: { duration: true },
    });

    return result._avg.duration || 0;
  }

  private static async getMonthlyTrends(
    whereClause: Prisma.AppointmentWhereInput
  ): Promise<Array<{ month: string; count: number }>> {
    const trends = await prisma.appointment.groupBy({
      by: ["scheduledDate"],
      where: whereClause,
      _count: { scheduledDate: true },
    });

    // Group by month
    const monthlyData: Record<string, number> = {};
    trends.forEach((trend) => {
      const month = trend.scheduledDate.toISOString().slice(0, 7); // YYYY-MM
      monthlyData[month] =
        (monthlyData[month] || 0) + trend._count.scheduledDate;
    });

    return Object.entries(monthlyData).map(([month, count]) => ({
      month,
      count,
    }));
  }

  private static async getProviderStatistics(
    whereClause: Prisma.AppointmentWhereInput
  ): Promise<
    Array<{
      providerId: string;
      providerName: string;
      totalAppointments: number;
      noShowRate: number;
    }>
  > {
    const providers = await prisma.appointment.groupBy({
      by: ["providerId"],
      where: whereClause,
      _count: { providerId: true },
    });

    const result = await Promise.all(
      providers.map(async (provider) => {
        const noShowCount = await prisma.appointment.count({
          where: {
            ...whereClause,
            providerId: provider.providerId,
            status: "NO_SHOW",
          },
        });

        const providerData = await prisma.provider.findUnique({
          where: { id: provider.providerId },
          select: { name: true },
        });

        return {
          providerId: provider.providerId,
          providerName: providerData?.name || "Unknown",
          totalAppointments: provider._count.providerId,
          noShowRate:
            provider._count.providerId > 0
              ? noShowCount / provider._count.providerId
              : 0,
        };
      })
    );

    return result;
  }

  // Configure reminders for appointment
  public static async configureReminders(
    id: string,
    reminderSettings: {
      methods: ("SMS" | "EMAIL" | "PUSH")[];
      times: number[];
    }
  ): Promise<IResponse<TAppointment>> {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        reminderSettings: reminderSettings as unknown as object,
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
            specialty: true,
          },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Reminder settings updated successfully",
      data: updated,
    };
  }
}
