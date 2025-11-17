import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import { NotificationHelper } from "../utils/notificationHelper";
import { Server as SocketIOServer } from "socket.io";
import { sendEmail } from "../utils/email";

export interface ReminderSettings {
  methods: ("SMS" | "EMAIL" | "PUSH")[];
  times: number[]; // hours before appointment
}

export interface ConfigureRemindersDto {
  methods: ("SMS" | "EMAIL" | "PUSH")[];
  times: number[]; // hours before appointment
}

export class AppointmentReminderService {
  /**
   * Configure reminders for an appointment
   */
  public static async configureReminders(
    appointmentId: string,
    dto: ConfigureRemindersDto,
  ): Promise<IResponse<unknown>> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    // Validate methods
    const validMethods = ["SMS", "EMAIL", "PUSH"];
    const invalidMethods = dto.methods.filter((m) => !validMethods.includes(m));
    if (invalidMethods.length > 0) {
      throw new AppError(
        `Invalid reminder methods: ${invalidMethods.join(", ")}`,
        400,
      );
    }

    // Update appointment with reminder settings
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        reminderSettings: {
          methods: dto.methods,
          times: dto.times,
        } as unknown as object,
      },
    });

    // Create reminder records
    const reminders = await Promise.all(
      dto.times.flatMap((hoursBefore) =>
        dto.methods.map((method) => {
          const reminderTime = new Date(
            appointment.scheduledDate.getTime() - hoursBefore * 60 * 60 * 1000,
          );
          return prisma.appointmentReminder.create({
            data: {
              appointmentId,
              reminderTime,
              reminderMethod: method,
              status: "PENDING",
            },
          });
        }),
      ),
    );

    return {
      statusCode: 200,
      message: "Reminders configured successfully",
      data: {
        appointment: updated,
        reminders,
      },
    };
  }

  /**
   * Get reminder configuration and status
   */
  public static async getReminders(
    appointmentId: string,
  ): Promise<IResponse<unknown>> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        reminders: {
          orderBy: { reminderTime: "asc" },
        },
      },
    });

    if (!appointment) {
      throw new AppError("Appointment not found", 404);
    }

    return {
      statusCode: 200,
      message: "Reminder configuration retrieved successfully",
      data: {
        reminderSettings: appointment.reminderSettings,
        reminders: appointment.reminders,
      },
    };
  }

  /**
   * Get pending reminders (for admin view)
   */
  public static async getPendingReminders(
    page?: number,
    limit?: number,
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const now = new Date();

    const [data, totalItems] = await Promise.all([
      prisma.appointmentReminder.findMany({
        where: {
          status: "PENDING",
          reminderTime: { lte: now },
        },
        skip,
        take: limitNum,
        orderBy: { reminderTime: "asc" },
        include: {
          appointment: {
            include: {
              patient: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
              provider: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.appointmentReminder.count({
        where: {
          status: "PENDING",
          reminderTime: { lte: now },
        },
      }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Pending reminders retrieved successfully",
    };
  }

  /**
   * Send a reminder (called by cron job)
   */
  public static async sendReminder(
    reminderId: string,
    io?: SocketIOServer,
  ): Promise<IResponse<unknown>> {
    try {
      const reminder = await prisma.appointmentReminder.findUnique({
        where: { id: reminderId },
        include: {
          appointment: {
            include: {
              patient: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
              provider: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!reminder) {
        throw new AppError("Reminder not found", 404);
      }

      if (reminder.status !== "PENDING") {
        throw new AppError(`Reminder already ${reminder.status}`, 409);
      }

      // Check if appointment is still valid
      if (
        reminder.appointment.status === "CANCELLED" ||
        reminder.appointment.status === "COMPLETED"
      ) {
        await prisma.appointmentReminder.update({
          where: { id: reminderId },
          data: {
            status: "FAILED",
            errorMessage: "Appointment is cancelled or completed",
          },
        });
        return {
          statusCode: 200,
          message: "Reminder skipped - appointment no longer valid",
          data: null,
        };
      }

      let sent = false;
      let errorMessage: string | null = null;

      try {
        const appointment = reminder.appointment;
        const message = `Reminder: You have an appointment with ${appointment.provider.name} on ${appointment.scheduledDate.toLocaleString()}`;

        switch (reminder.reminderMethod) {
          case "PUSH":
            if (io) {
              await NotificationHelper.sendToUser(
                io,
                appointment.patientId,
                "Appointment Reminder",
                message,
                "info",
                `/appointments/${appointment.id}`,
                "appointment",
                appointment.id,
              );
              sent = true;
            } else {
              errorMessage = "Socket.io not available";
            }
            break;

          case "EMAIL":
            // Get patient email from user account if linked
            // For now, using a placeholder - in production, link Patient to User
            try {
              // await sendEmail({
              //   to: patientEmail,
              //   subject: "Appointment Reminder",
              //   text: message,
              // });
              sent = true; // Placeholder - implement email sending
            } catch (error) {
              errorMessage = `Email send failed: ${error}`;
            }
            break;

          case "SMS":
            // Integrate with SMS gateway
            // For now, placeholder
            try {
              // await sendSMS(patient.phone, message);
              sent = true; // Placeholder - implement SMS sending
            } catch (error) {
              errorMessage = `SMS send failed: ${error}`;
            }
            break;

          default:
            errorMessage = `Unknown reminder method: ${reminder.reminderMethod}`;
        }
      } catch (error) {
        errorMessage = `Error sending reminder: ${error}`;
      }

      // Update reminder status
      const updated = await prisma.appointmentReminder.update({
        where: { id: reminderId },
        data: {
          status: sent ? "SENT" : "FAILED",
          sentAt: sent ? new Date() : null,
          errorMessage,
        },
      });

      return {
        statusCode: sent ? 200 : 500,
        message: sent
          ? "Reminder sent successfully"
          : `Reminder failed: ${errorMessage}`,
        data: updated,
      };
    } catch (error) {
      await prisma.appointmentReminder.update({
        where: { id: reminderId },
        data: {
          status: "FAILED",
          errorMessage: `Unexpected error: ${error}`,
        },
      });
      throw error;
    }
  }
}
