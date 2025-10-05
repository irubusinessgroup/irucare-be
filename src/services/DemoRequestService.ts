import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateDemoRequestDto } from "../utils/interfaces/common";
import { sendEmail, renderTemplate } from "../utils/email";
import { Server as SocketIOServer } from "socket.io";
import { NotificationHelper } from "../utils/notificationHelper";

export class DemoRequestService {
  public static async createDemoRequest(
    data: CreateDemoRequestDto,
    io?: SocketIOServer,
  ) {
    const demoRequest = await prisma.demoRequest.create({
      data: {
        ...data,
        status: "REQUESTED",
      },
    });

    // Send confirmation email
    try {
      const html = renderTemplate("demo-request-confirmation.html", {
        name: data.contactName,
        companyName: data.companyName,
      });
      await sendEmail({
        to: data.contactEmail,
        subject: `Demo Request Received: ${data.companyName}`,
        html,
      });
    } catch (err) {
      console.error("Failed to send demo request confirmation:", err);
    }

    // Send notification to admin
    try {
      const html = renderTemplate("demo-request-admin.html", {
        companyName: data.companyName,
        name: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        adminDashboardUrl: process.env.ADMIN_DASHBOARD_URL || "",
      });
      await sendEmail({
        to:
          process.env.ADMIN_NOTIFICATION_EMAIL ||
          process.env.EMAIL_USER ||
          data.contactEmail,
        subject: `New Demo Request: ${data.companyName}`,
        html,
      });

      if (io) {
        await NotificationHelper.sendToRole(
          io,
          "ADMIN",
          "New Demo Request",
          `New demo request from ${data.companyName} (${data.contactName})`,
          "info",
          process.env.ADMIN_DASHBOARD_URL
            ? `${process.env.ADMIN_DASHBOARD_URL}/demo-requests/${demoRequest.id}`
            : undefined,
          "demo_request",
          demoRequest.id,
          {
            companyName: data.companyName,
            contactName: data.contactName,
            contactEmail: data.contactEmail,
            contactPhone: data.contactPhone,
          },
        );
      }
    } catch (err) {
      console.error("Failed to send demo request admin notification:", err);
    }

    return {
      message:
        "Demo request submitted successfully. We'll contact you within 24 hours.",
      data: demoRequest,
    };
  }

  public static async getAllDemoRequests(
    status?: string,
    limit?: number,
    page?: number,
  ) {
    const queryOptions: Record<string, unknown> = {};

    if (status) {
      queryOptions.status = status;
    }

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const [requests, total] = await Promise.all([
      prisma.demoRequest.findMany({
        where: queryOptions,
        include: {
          trialApplication: true,
        },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.demoRequest.count({ where: queryOptions }),
    ]);

    return {
      data: requests,
      totalItems: total,
      currentPage: page || 1,
      itemsPerPage: limit || requests.length,
      message: "Demo requests retrieved successfully",
    };
  }

  public static async scheduleDemo(
    id: string,
    scheduleData: {
      scheduledDate: Date;
      meetingLink: string;
      assignedTo: string;
    },
  ) {
    const demoRequest = await prisma.demoRequest.findUnique({
      where: { id },
    });

    if (!demoRequest) {
      throw new AppError("Demo request not found", 404);
    }

    const updated = await prisma.demoRequest.update({
      where: { id },
      data: {
        ...scheduleData,
        status: "SCHEDULED",
      },
    });

    // Send confirmation email with meeting link
    try {
      const scheduledDate = scheduleData.scheduledDate.toLocaleDateString(
        "en-US",
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        },
      );
      const scheduledTime = scheduleData.scheduledDate.toLocaleTimeString(
        "en-US",
        {
          hour: "2-digit",
          minute: "2-digit",
        },
      );
      const html = renderTemplate("demo-request-scheduled.html", {
        name: demoRequest.contactName,
        companyName: demoRequest.companyName,
        scheduledDate,
        scheduledTime,
        meetingLink: scheduleData.meetingLink,
      });
      await sendEmail({
        to: demoRequest.contactEmail,
        subject: `Demo Scheduled: ${demoRequest.companyName}`,
        html,
      });
    } catch (err) {
      console.error("Failed to send demo scheduled email:", err);
    }

    return {
      message: "Demo scheduled successfully",
      data: updated,
    };
  }

  public static async completeDemo(
    id: string,
    completionData: {
      followUpNotes: string;
    },
  ) {
    const demoRequest = await prisma.demoRequest.findUnique({
      where: { id },
    });

    if (!demoRequest) {
      throw new AppError("Demo request not found", 404);
    }

    if (demoRequest.status !== "SCHEDULED") {
      throw new AppError(
        "Only scheduled demos can be marked as completed",
        400,
      );
    }

    const updated = await prisma.demoRequest.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        followUpNotes: completionData.followUpNotes,
      },
    });

    // Send thank you email
    try {
      const html = renderTemplate("demo-request-completed.html", {
        name: demoRequest.contactName,
        companyName: demoRequest.companyName,
      });
      await sendEmail({
        to: demoRequest.contactEmail,
        subject: `Thank you for attending the demo - ${demoRequest.companyName}`,
        html,
      });
    } catch (err) {
      console.error("Failed to send demo completion email:", err);
    }

    return {
      message: "Demo marked as completed",
      data: updated,
    };
  }

  public static async cancelDemo(
    id: string,
    cancellationData: {
      reason: string;
    },
  ) {
    const demoRequest = await prisma.demoRequest.findUnique({
      where: { id },
    });

    if (!demoRequest) {
      throw new AppError("Demo request not found", 404);
    }

    const updated = await prisma.demoRequest.update({
      where: { id },
      data: {
        status: "CANCELLED",
        followUpNotes: `Cancelled: ${cancellationData.reason}`,
      },
    });

    // Send cancellation email
    try {
      const html = renderTemplate("demo-request-cancelled.html", {
        name: demoRequest.contactName,
        companyName: demoRequest.companyName,
      });
      await sendEmail({
        to: demoRequest.contactEmail,
        subject: `Demo Cancelled - ${demoRequest.companyName}`,
        html,
      });
    } catch (err) {
      console.error("Failed to send demo cancellation email:", err);
    }

    return {
      message: "Demo cancelled successfully",
      data: updated,
    };
  }

  public static async markNoShow(id: string) {
    const demoRequest = await prisma.demoRequest.findUnique({
      where: { id },
    });

    if (!demoRequest) {
      throw new AppError("Demo request not found", 404);
    }

    const updated = await prisma.demoRequest.update({
      where: { id },
      data: {
        status: "NO_SHOW",
        followUpNotes: "Client did not attend the scheduled demo",
      },
    });

    return {
      message: "Demo marked as no-show",
      data: updated,
    };
  }
}
