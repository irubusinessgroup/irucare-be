import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import {
  AppointmentStatus,
  AppointmentType,
  type Prisma,
} from "@prisma/client";
import {
  CreateAppointmentDto,
  // IPaged,
  UpdateAppointmentDto,
} from "../utils/interfaces/common";
import { Paginations, QueryOptions } from "../utils/DBHelpers";

interface WeekViewAppointment {
  id: string;
  time: string;
  duration: number;
  patient: { id: string; name: string; patientNO: string | null };
  provider: { id: string; name: string };
  status: AppointmentStatus;
  room: string | null;
  isWalkIn: boolean;
}

export class AppointmentService {
  public static async createAppointment(
    data: CreateAppointmentDto,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    const userId = req.user?.id;

    if (!companyId) throw new AppError("Company ID is missing", 400);
    if (!userId) throw new AppError("User ID is missing", 400);

    // Validate required fields
    if (!data.patientId || !data.providerId || !data.scheduledDate) {
      throw new AppError("Missing required fields", 400);
    }

    // Check if patient exists
    const patient = await prisma.patient.findFirst({
      where: { id: data.patientId, companyId },
    });
    if (!patient) throw new AppError("Patient not found", 404);

    // Check if provider exists
    const provider = await prisma.provider.findFirst({
      where: { id: data.providerId, companyId },
    });
    if (!provider) throw new AppError("Provider not found", 404);

    // Check for time conflicts if not walk-in
    if (!data.isWalkIn) {
      const conflict = await this.checkTimeConflict(
        data.providerId,
        new Date(data.scheduledDate),
        data.duration,
        companyId,
      );
      if (conflict) throw new AppError("Time slot already booked", 409);
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        providerId: data.providerId,
        companyId,
        appointmentType:
          AppointmentType[data.appointmentType as keyof typeof AppointmentType],
        status: "SCHEDULED",
        scheduledDate: new Date(data.scheduledDate),
        duration: data.duration,
        reason: data.reason,
        notes: data.notes,
        room: data.room,
        isWalkIn: data.isWalkIn || false,
        createdBy: userId,
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true, patientNO: true },
        },
        provider: { select: { id: true, name: true, specialty: true } },
      },
    });

    return {
      statusCode: 201,
      message: data.isWalkIn
        ? "Walk-in patient registered successfully"
        : "Appointment created successfully",
      data: appointment,
    };
  }

  public static async registerWalkIn(data: CreateAppointmentDto, req: Request) {
    return this.createAppointment({ ...data, isWalkIn: true }, req);
  }

  public static async getDayView(
    date: string,
    providerId: string | undefined,
    room: string | undefined,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const whereClause: Prisma.AppointmentWhereInput = {
      companyId,
      scheduledDate: { gte: startOfDay, lte: endOfDay },
      status: { notIn: ["CANCELLED"] },
    };

    if (providerId) whereClause.providerId = providerId;
    if (room) whereClause.room = room;

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: {
          select: { id: true, name: true, patientNO: true, phone: true },
        },
        provider: { select: { id: true, name: true, specialty: true } },
      },
      orderBy: { scheduledDate: "asc" },
    });

    return {
      statusCode: 200,
      message: "Day view retrieved successfully",
      data: {
        date,
        appointments: appointments.map((apt) => ({
          id: apt.id,
          time: apt.scheduledDate.toISOString(),
          duration: apt.duration,
          patient: apt.patient,
          provider: apt.provider,
          status: apt.status,
          room: apt.room,
          isWalkIn: apt.isWalkIn,
          queueStatus: apt.queueStatus,
          reason: apt.reason,
        })),
      },
    };
  }

  public static async getWeekView(
    startDate: string,
    providerId: string | undefined,
    room: string | undefined,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    const whereClause: Prisma.AppointmentWhereInput = {
      companyId,
      scheduledDate: { gte: start, lt: end },
      status: { notIn: ["CANCELLED"] },
    };

    if (providerId) whereClause.providerId = providerId;
    if (room) whereClause.room = room;

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: { select: { id: true, name: true, patientNO: true } },
        provider: { select: { id: true, name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    });

    // Group by day
    const dayGroups: { [key: string]: WeekViewAppointment[] } = {};
    appointments.forEach((apt) => {
      const day = apt.scheduledDate.toISOString().split("T")[0];
      if (!dayGroups[day]) dayGroups[day] = [];
      dayGroups[day].push({
        id: apt.id,
        time: apt.scheduledDate.toISOString(),
        duration: apt.duration,
        patient: apt.patient,
        provider: apt.provider,
        status: apt.status,
        room: apt.room,
        isWalkIn: apt.isWalkIn,
      });
    });

    return {
      statusCode: 200,
      message: "Week view retrieved successfully",
      data: dayGroups,
    };
  }

  public static async getMonthView(
    year: number,
    month: number,
    providerId: string | undefined,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const whereClause: Prisma.AppointmentWhereInput = {
      companyId,
      scheduledDate: { gte: start, lte: end },
      status: { notIn: ["CANCELLED"] },
    };

    if (providerId) whereClause.providerId = providerId;

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      select: {
        id: true,
        scheduledDate: true,
        status: true,
        provider: { select: { name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    });

    // Group by date
    const dateGroups: { [key: string]: number } = {};
    appointments.forEach((apt) => {
      const date = apt.scheduledDate.toISOString().split("T")[0];
      dateGroups[date] = (dateGroups[date] || 0) + 1;
    });

    return {
      statusCode: 200,
      message: "Month view retrieved successfully",
      data: dateGroups,
    };
  }

  public static async getWaitingRoom(req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const waitingPatients = await prisma.appointment.findMany({
      where: {
        companyId,
        scheduledDate: { gte: today, lte: endOfDay },
        queueStatus: "WAITING",
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      include: {
        patient: {
          select: { id: true, name: true, patientNO: true, phone: true },
        },
        provider: { select: { id: true, name: true, specialty: true } },
      },
      orderBy: [{ checkInTime: "asc" }, { scheduledDate: "asc" }],
    });

    return {
      statusCode: 200,
      message: "Waiting room list retrieved",
      data: waitingPatients.map((apt) => ({
        id: apt.id,
        queueNumber: apt.queueNumber,
        patient: apt.patient,
        provider: apt.provider,
        reason: apt.reason,
        checkInTime: apt.checkInTime,
        scheduledTime: apt.scheduledDate,
        isWalkIn: apt.isWalkIn,
      })),
    };
  }

  public static async checkInPatient(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!appointment) throw new AppError("Appointment not found", 404);

    // Get next queue number for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastQueue = await prisma.appointment.findFirst({
      where: {
        companyId,
        scheduledDate: { gte: today },
        queueNumber: { not: null },
      },
      orderBy: { queueNumber: "desc" },
    });

    const queueNumber = (lastQueue?.queueNumber || 0) + 1;

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        queueStatus: "WAITING",
        queueNumber,
        checkInTime: new Date(),
        status: "CONFIRMED",
      },
      include: {
        patient: { select: { id: true, name: true, patientNO: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    return {
      statusCode: 200,
      message: "Patient checked in successfully",
      data: updated,
    };
  }

  public static async callNextPatient(providerId: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    // Get next waiting patient for this provider
    const nextPatient = await prisma.appointment.findFirst({
      where: {
        companyId,
        providerId,
        queueStatus: "WAITING",
        status: { in: ["CONFIRMED"] },
      },
      include: {
        patient: {
          select: { id: true, name: true, patientNO: true, phone: true },
        },
        provider: { select: { id: true, name: true } },
      },
      orderBy: [{ queueNumber: "asc" }],
    });

    if (!nextPatient) {
      return {
        statusCode: 404,
        message: "No patients in queue",
        data: null,
      };
    }

    // Update status to IN_PROGRESS
    const updated = await prisma.appointment.update({
      where: { id: nextPatient.id },
      data: {
        queueStatus: "IN_PROGRESS",
        status: "IN_PROGRESS",
        calledAt: new Date(),
      },
      include: {
        patient: {
          select: { id: true, name: true, patientNO: true, phone: true },
        },
        provider: { select: { id: true, name: true } },
      },
    });

    return {
      statusCode: 200,
      message: "Patient called successfully",
      data: updated,
    };
  }

  public static async transferPatient(
    id: string,
    transferTo: string,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!appointment) throw new AppError("Appointment not found", 404);

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        queueStatus: "TRANSFERRED",
        transferredTo: transferTo,
        notes: appointment.notes
          ? `${appointment.notes}\nTransferred to: ${transferTo}`
          : `Transferred to: ${transferTo}`,
      },
      include: {
        patient: { select: { id: true, name: true, patientNO: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    return {
      statusCode: 200,
      message: `Patient transferred to ${transferTo}`,
      data: updated,
    };
  }

  public static async getAllAppointments(
    req: Request,
    searchq?: string,
    limit?: number,
    currentPage?: number,
    status?: string,
    providerId?: string,
    startDate?: string,
    endDate?: string,
  ) {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) throw new AppError("Company ID is missing", 400);

      const searchOptions = QueryOptions(
        ["patient.name", "patient.phone", "patient.patientNO", "provider.name"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const whereClause: Prisma.AppointmentWhereInput = {
        companyId,
        ...searchOptions,
      };

      // Filter by status if provided
      if (status) {
        whereClause.status = status as AppointmentStatus;
      }

      // Filter by provider if provided
      if (providerId) {
        whereClause.providerId = providerId;
      }

      // Filter by date range if provided
      if (startDate || endDate) {
        whereClause.scheduledDate = {};
        if (startDate) whereClause.scheduledDate.gte = new Date(startDate);
        if (endDate) whereClause.scheduledDate.lte = new Date(endDate);
      }

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          patient: {
            select: { id: true, name: true, phone: true, patientNO: true },
          },
          provider: { select: { id: true, name: true, specialty: true } },
        },
        ...pagination,
        orderBy: { scheduledDate: "desc" },
      });

      const totalItems = await prisma.appointment.count({
        where: whereClause,
      });

      return {
        statusCode: 200,
        message: "All appointments retrieved successfully",
        data: appointments,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getTodayAppointments(
    providerId: string | undefined,
    req: Request,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ) {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) throw new AppError("Company ID is missing", 400);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const searchOptions = QueryOptions(
        ["patient.name", "patient.phone", "patient.patientNO", "provider.name"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const whereClause: Prisma.AppointmentWhereInput = {
        companyId,
        scheduledDate: { gte: today, lte: endOfDay },
        ...searchOptions,
      };

      if (providerId) whereClause.providerId = providerId;

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          patient: {
            select: { id: true, name: true, phone: true, patientNO: true },
          },
          provider: { select: { id: true, name: true, specialty: true } },
        },
        ...pagination,
        orderBy: { scheduledDate: "asc" },
      });

      const totalItems = await prisma.appointment.count({
        where: whereClause,
      });

      return {
        statusCode: 200,
        message: "Today's appointments retrieved",
        data: appointments,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getUpcomingAppointments(
    days: number = 7,
    providerId: string | undefined,
    req: Request,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ){
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) throw new AppError("Company ID is missing", 400);

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(now.getDate() + days);

      const searchOptions = QueryOptions(
        ["patient.name", "patient.phone", "patient.patientNO", "provider.name"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const whereClause: Prisma.AppointmentWhereInput = {
        companyId,
        scheduledDate: { gte: now, lte: futureDate },
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        ...searchOptions,
      };

      if (providerId) whereClause.providerId = providerId;

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          patient: {
            select: { id: true, name: true, phone: true, patientNO: true },
          },
          provider: { select: { id: true, name: true, specialty: true } },
        },
        ...pagination,
        orderBy: { scheduledDate: "asc" },
      });

      const totalItems = await prisma.appointment.count({
        where: whereClause,
      });

      return {
        statusCode: 200,
        message: "Upcoming appointments retrieved",
        data: appointments,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getMissedAppointments(
    startDate: string | undefined,
    endDate: string | undefined,
    req: Request,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ) {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) throw new AppError("Company ID is missing", 400);

      const searchOptions = QueryOptions(
        ["patient.name", "patient.phone", "patient.patientNO", "provider.name"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const whereClause: Prisma.AppointmentWhereInput = {
        companyId,
        status: "NO_SHOW",
        ...searchOptions,
      };

      if (startDate || endDate) {
        whereClause.scheduledDate = {};
        if (startDate) whereClause.scheduledDate.gte = new Date(startDate);
        if (endDate) whereClause.scheduledDate.lte = new Date(endDate);
      }

      const appointments = await prisma.appointment.findMany({
        where: whereClause,
        include: {
          patient: {
            select: { id: true, name: true, phone: true, patientNO: true },
          },
          provider: { select: { id: true, name: true, specialty: true } },
        },
        ...pagination,
        orderBy: { scheduledDate: "desc" },
      });

      const totalItems = await prisma.appointment.count({
        where: whereClause,
      });

      return {
        statusCode: 200,
        message: "Missed appointments retrieved",
        data: appointments,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAppointmentById(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
      include: {
        patient: {
          select: { id: true, name: true, phone: true, patientNO: true },
        },
        provider: {
          select: { id: true, name: true, email: true, specialty: true },
        },
        createdByUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!appointment) throw new AppError("Appointment not found", 404);

    return {
      statusCode: 200,
      message: "Appointment retrieved successfully",
      data: appointment,
    };
  }

  public static async updateAppointment(
    id: string,
    data: UpdateAppointmentDto,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const existing = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Appointment not found", 404);

    // Check time conflicts if date/duration changed
    if (data.scheduledDate || data.duration) {
      const scheduledDate = data.scheduledDate
        ? new Date(data.scheduledDate)
        : existing.scheduledDate;
      const duration = data.duration || existing.duration;

      const conflict = await this.checkTimeConflict(
        existing.providerId,
        scheduledDate,
        duration,
        companyId,
        id,
      );
      if (conflict) throw new AppError("Time slot conflict", 409);
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        ...(data.appointmentType && {
          appointmentType:
            AppointmentType[
              data.appointmentType as keyof typeof AppointmentType
            ],
        }),
        ...(data.scheduledDate && {
          scheduledDate: new Date(data.scheduledDate),
        }),
        ...(data.duration && { duration: data.duration }),
        ...(data.reason && { reason: data.reason }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.room !== undefined && { room: data.room }),
        ...(data.status && {
          status:
            AppointmentStatus[data.status as keyof typeof AppointmentStatus],
        }),
        updatedAt: new Date(),
      },
      include: {
        patient: {
          select: { id: true, name: true, phone: true, patientNO: true },
        },
        provider: { select: { id: true, name: true, specialty: true } },
      },
    });

    return {
      statusCode: 200,
      message: "Appointment updated successfully",
      data: updated,
    };
  }

  public static async cancelAppointment(
    id: string,
    reason: string,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const appointment = await prisma.appointment.findFirst({
      where: { id, companyId },
    });

    if (!appointment) throw new AppError("Appointment not found", 404);

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: "CANCELLED",
        queueStatus: appointment.queueStatus ? "CANCELLED" : null,
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
      include: {
        patient: { select: { id: true, name: true, patientNO: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    return {
      statusCode: 200,
      message: "Appointment cancelled successfully",
      data: updated,
    };
  }

  public static async markNoShow(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: "NO_SHOW",
        noShowAt: new Date(),
      },
      include: {
        patient: { select: { id: true, name: true, patientNO: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    return {
      statusCode: 200,
      message: "Appointment marked as no-show",
      data: updated,
    };
  }

  public static async completeAppointment(
    id: string,
    encounterId: string | undefined,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: "COMPLETED",
        queueStatus: "COMPLETED",
        completedAt: new Date(),
        ...(encounterId && { encounterId }),
      },
      include: {
        patient: { select: { id: true, name: true, patientNO: true } },
        provider: { select: { id: true, name: true } },
      },
    });

    return {
      statusCode: 200,
      message: "Appointment completed successfully",
      data: updated,
    };
  }

  private static async checkTimeConflict(
    providerId: string,
    scheduledDate: Date,
    duration: number,
    companyId: string,
    excludeId?: string,
  ): Promise<boolean> {
    const endTime = new Date(scheduledDate.getTime() + duration * 60000);

    const whereClause: Prisma.AppointmentWhereInput = {
      providerId,
      companyId,
      status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] },
      scheduledDate: {
        gte: new Date(scheduledDate.getTime() - 24 * 60 * 60 * 1000),
        lt: endTime,
      },
    };

    if (excludeId) whereClause.id = { not: excludeId };

    const conflict = await prisma.appointment.findFirst({ where: whereClause });
    return !!conflict;
  }

  public static async getAvailableSlots(
    providerId: string,
    date: string,
    duration: number = 30,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    // Get provider schedule - fix time parsing
    const schedule = await prisma.providerSchedule.findFirst({
      where: { providerId, dayOfWeek, isActive: true },
    });

    if (!schedule) {
      return {
        statusCode: 200,
        message: "No schedule found for this day",
        data: [],
      };
    }

    // Parse time strings to actual times for the target date
    const [startHours, startMinutes] = schedule.startTime
      .split(":")
      .map(Number);
    const [endHours, endMinutes] = schedule.endTime.split(":").map(Number);

    const startTime = new Date(targetDate);
    startTime.setHours(startHours, startMinutes, 0, 0);

    const endTime = new Date(targetDate);
    endTime.setHours(endHours, endMinutes, 0, 0);

    // Get blocks for this date - fix date comparison
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const blocks = await prisma.providerScheduleBlock.findMany({
      where: {
        providerId,
        OR: [
          {
            // Blocks that start during the target day
            startDate: { gte: startOfDay, lte: endOfDay },
          },
          {
            // Blocks that end during the target day
            endDate: { gte: startOfDay, lte: endOfDay },
          },
          {
            // Blocks that span the entire target day
            startDate: { lte: startOfDay },
            endDate: { gte: endOfDay },
          },
        ],
      },
    });

    // Get existing appointments
    const appointments = await prisma.appointment.findMany({
      where: {
        providerId,
        companyId,
        scheduledDate: { gte: startOfDay, lte: endOfDay },
        status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS"] },
      },
    });

    // Generate slots
    const slots = [];
    let currentTime = new Date(startTime);

    while (currentTime < endTime) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);

      if (slotEnd <= endTime) {
        const isBlocked = blocks.some((block) => {
          const blockStart = new Date(block.startDate);
          const blockEnd = new Date(block.endDate);
          return currentTime < blockEnd && slotEnd > blockStart;
        });

        const hasAppointment = appointments.some((apt) => {
          const aptStart = new Date(apt.scheduledDate);
          const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
          return currentTime < aptEnd && slotEnd > aptStart;
        });

        slots.push({
          time: currentTime.toTimeString().slice(0, 5),
          available: !isBlocked && !hasAppointment,
        });
      }

      currentTime = new Date(currentTime.getTime() + 15 * 60000); // 15-min intervals
    }

    console.log(slots);

    return {
      statusCode: 200,
      message: "Available slots retrieved",
      data: slots,
    };
  }
}
