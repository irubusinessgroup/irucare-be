import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateTrialApplicationDto,
  UpdateTrialApplicationDto,
} from "../utils/interfaces/common";
import { generateApplicationNumber } from "../utils/trialNumberGenerator";
import { generateNDAPdf } from "../utils/pdfGenerator";
import { sendEmail, renderTemplate } from "../utils/email";
import { Server as SocketIOServer } from "socket.io";
import { NotificationHelper } from "../utils/notificationHelper";

export class TrialApplicationService {
  public static async createTrialApplication(
    data: CreateTrialApplicationDto,
    io?: SocketIOServer,
  ) {
    const applicationNumber = await generateApplicationNumber();

    const application = await prisma.trialApplication.create({
      data: {
        ...data,
        applicationNumber,
        status: "PENDING",
      },
    });

    // Send confirmation email to applicant
    try {
      const html = renderTemplate("trial-application-confirmation.html", {
        name: `${data.contactFirstName} ${data.contactLastName}`.trim(),
        organizationName: data.organizationName,
        applicationNumber,
      });
      await sendEmail({
        to: data.contactEmail,
        subject: `Trial Application Received: ${applicationNumber}`,
        html,
      });
    } catch (err) {
      console.error("Failed to send trial application confirmation:", err);
    }

    // Send notification to admin
    try {
      const html = renderTemplate("trial-application-admin.html", {
        applicationNumber,
        organizationName: data.organizationName,
        adminDashboardUrl: process.env.ADMIN_DASHBOARD_URL || "",
      });
      await sendEmail({
        to:
          process.env.ADMIN_NOTIFICATION_EMAIL ||
          process.env.EMAIL_USER ||
          data.contactEmail,
        subject: `New Trial Application: ${data.organizationName}`,
        html,
      });

      if (io) {
        await NotificationHelper.sendToRole(
          io,
          "ADMIN",
          "New Trial Application",
          `New trial application ${applicationNumber} from ${data.organizationName}`,
          "info",
          process.env.ADMIN_DASHBOARD_URL
            ? `${process.env.ADMIN_DASHBOARD_URL}/trial-applications/${application.id}`
            : undefined,
          "trial_application",
          application.id,
          {
            applicationNumber,
            organizationName: data.organizationName,
            contactEmail: data.contactEmail,
          },
        );
      }
    } catch (err) {
      console.error(
        "Failed to send trial application admin notification:",
        err,
      );
    }

    return {
      message: "Trial application submitted successfully",
      data: application,
    };
  }

  public static async getTrialApplication(id: string) {
    const application = await prisma.trialApplication.findUnique({
      where: { id },
      include: {
        feedbacks: { orderBy: { createdAt: "desc" } },
        demoRequests: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!application) throw new AppError("Trial application not found", 404);

    return {
      message: "Trial application fetched successfully",
      data: application,
    };
  }

  public static async getAllTrialApplications(
    status?: string,
    searchQuery?: string,
    limit?: number,
    page?: number,
  ) {
    const queryOptions: Record<string, unknown> = {};

    if (status) queryOptions.status = status;

    if (searchQuery) {
      queryOptions.OR = [
        { applicationNumber: { contains: searchQuery, mode: "insensitive" } },
        { organizationName: { contains: searchQuery, mode: "insensitive" } },
        { contactEmail: { contains: searchQuery, mode: "insensitive" } },
        { contactFirstName: { contains: searchQuery, mode: "insensitive" } },
        { contactLastName: { contains: searchQuery, mode: "insensitive" } },
      ];
    }

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const [applications, total] = await Promise.all([
      prisma.trialApplication.findMany({
        where: queryOptions,
        include: { feedbacks: true, demoRequests: true },
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.trialApplication.count({ where: queryOptions }),
    ]);

    return {
      data: applications,
      totalItems: total,
      currentPage: page || 1,
      itemsPerPage: limit || applications.length,
      message: "Trial applications retrieved successfully",
    };
  }

  public static async updateTrialApplicationStatus(
    id: string,
    data: UpdateTrialApplicationDto,
    adminUserId: string,
  ) {
    const application = await prisma.trialApplication.findUnique({
      where: { id },
    });
    if (!application) throw new AppError("Trial application not found", 404);

    const updateData: Record<string, unknown> = {
      ...data,
      reviewedBy: adminUserId,
      reviewedAt: new Date(),
    };

    if (data.status === "APPROVED") {
      updateData.approvedBy = adminUserId;
      updateData.approvedAt = new Date();

      if (application.preferredStartDate) {
        updateData.trialStartDate = application.preferredStartDate;
        updateData.trialEndDate = new Date(
          application.preferredStartDate.getTime() +
            application.trialDuration * 24 * 60 * 60 * 1000,
        );
      }
    }

    const updatedApplication = await prisma.trialApplication.update({
      where: { id },
      data: updateData,
    });

    // Send status update email
    try {
      const subject = `Trial Application ${data.status}: ${application.applicationNumber}`;
      let html = "";
      if (data.status === "APPROVED") {
        html = renderTemplate("trial-application-status-approved.html", {
          name: `${application.contactFirstName} ${application.contactLastName}`.trim(),
          organizationName: application.organizationName,
          applicationNumber: application.applicationNumber,
          applicationId: application.id,
          frontendUrl: process.env.FRONTEND_URL || "",
        });
      } else if (data.status === "REJECTED") {
        const rejectionReasonHtml = data.rejectionReason
          ? `<p><strong>Reason:</strong> ${data.rejectionReason}</p>`
          : "";
        html = renderTemplate("trial-application-status-rejected.html", {
          name: `${application.contactFirstName} ${application.contactLastName}`.trim(),
          applicationNumber: application.applicationNumber,
          rejectionReasonHtml,
        });
      } else if (data.status) {
        html = renderTemplate("trial-application-status-generic.html", {
          name: `${application.contactFirstName} ${application.contactLastName}`.trim(),
          applicationNumber: application.applicationNumber,
          status: data.status,
        });
      }

      if (html) {
        await sendEmail({
          to: application.contactEmail,
          subject,
          html,
        });
      }
    } catch (err) {
      console.error("Failed to send trial status update email:", err);
    }

    return {
      message: `Trial application ${data.status?.toLowerCase()} successfully`,
      data: updatedApplication,
    };
  }

  public static async generateNDA(id: string) {
    const application = await prisma.trialApplication.findUnique({
      where: { id },
    });
    if (!application) throw new AppError("Trial application not found", 404);

    const pdfBuffer = await generateNDAPdf({
      clientName: application.organizationName,
      clientAddress: application.countryCity,
      clientEmail: application.contactEmail,
      clientPhone: application.contactPhone,
      contactPerson: `${application.contactFirstName} ${application.contactLastName}`,
      date: new Date().toISOString().split("T")[0],
    });

    if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
      throw new Error("Invalid PDF generated");
    }

    const pdfSignature = pdfBuffer.slice(0, 4).toString();
    if (pdfSignature !== "%PDF") {
      throw new Error("Generated file is not a valid PDF");
    }

    return pdfBuffer;
  }

  public static async signNDA(
    id: string,
    data: { signature: string; signatureDate: string },
  ) {
    const application = await prisma.trialApplication.findUnique({
      where: { id },
    });

    if (!application) throw new AppError("Application not found", 404);
    if (application.status !== "APPROVED") {
      throw new AppError(
        "Application must be approved before signing NDA",
        400,
      );
    }

    const updated = await prisma.trialApplication.update({
      where: { id },
      data: {
        ndaSigned: true,
        ndaSignedAt: new Date(),
        signature: data.signature,
        signatureDate: new Date(data.signatureDate),
        status: "ACTIVE",
      },
    });

    // Send confirmation email
    try {
      const html = renderTemplate("trial-activated.html", {
        name: `${application.contactFirstName} ${application.contactLastName}`.trim(),
        organizationName: application.organizationName,
        trialStartDate: updated.trialStartDate?.toLocaleDateString() || "Soon",
        trialEndDate: updated.trialEndDate?.toLocaleDateString() || "TBD",
      });
      await sendEmail({
        to: application.contactEmail,
        subject: `Trial Activated - ${application.organizationName}`,
        html,
      });
    } catch (err) {
      console.error("Failed to send trial activation email:", err);
    }

    return { message: "NDA signed successfully", data: updated };
  }

  public static async submitFeedback(
    applicationId: string,
    feedbackData: {
      feedbackMonth: number;
      rating: number;
      comments: string;
      improvements?: string;
      wouldRecommend: boolean;
    },
  ) {
    const application = await prisma.trialApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw new AppError("Trial application not found", 404);

    if (application.status !== "ACTIVE")
      throw new AppError("Trial is not active", 400);

    const feedback = await prisma.trialFeedback.create({
      data: { trialApplicationId: applicationId, ...feedbackData },
    });

    return {
      message: "Feedback submitted successfully",
      data: feedback,
    };
  }
}
