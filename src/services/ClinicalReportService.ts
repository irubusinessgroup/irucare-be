import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IResponse } from "../utils/interfaces/common";
import type { Prisma } from "@prisma/client";

export class ClinicalReportService {
  /**
   * Get provider performance report
   */
  public static async getProviderPerformance(
    req: Request,
    providerId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause: Prisma.AppointmentWhereInput = { companyId };
    if (providerId) whereClause.providerId = providerId;
    if (startDate || endDate) {
      whereClause.scheduledDate = {};
      if (startDate) whereClause.scheduledDate.gte = new Date(startDate);
      if (endDate) whereClause.scheduledDate.lte = new Date(endDate);
    }

    const [
      totalAppointments,
      completedAppointments,
      noShowAppointments,
      totalEncounters,
      totalPrescriptions,
      totalLabOrders,
      revenue,
    ] = await Promise.all([
      prisma.appointment.count({ where: whereClause }),
      prisma.appointment.count({
        where: { ...whereClause, status: "COMPLETED" },
      }),
      prisma.appointment.count({
        where: { ...whereClause, status: "NO_SHOW" },
      }),
      prisma.encounter.count({
        where: {
          providerId: providerId || undefined,
          createdAt:
            startDate || endDate
              ? {
                  gte: startDate ? new Date(startDate) : undefined,
                  lte: endDate ? new Date(endDate) : undefined,
                }
              : undefined,
        },
      }),
      prisma.prescription.count({
        where: {
          providerId: providerId || undefined,
          prescribedAt:
            startDate || endDate
              ? {
                  gte: startDate ? new Date(startDate) : undefined,
                  lte: endDate ? new Date(endDate) : undefined,
                }
              : undefined,
        },
      }),
      prisma.labOrder.count({
        where: {
          providerId: providerId || undefined,
          orderedAt:
            startDate || endDate
              ? {
                  gte: startDate ? new Date(startDate) : undefined,
                  lte: endDate ? new Date(endDate) : undefined,
                }
              : undefined,
        },
      }),
      prisma.clinicBilling.aggregate({
        where: {
          encounter: providerId
            ? {
                providerId,
                createdAt:
                  startDate || endDate
                    ? {
                        gte: startDate ? new Date(startDate) : undefined,
                        lte: endDate ? new Date(endDate) : undefined,
                      }
                    : undefined,
              }
            : undefined,
          status: "PAID",
        },
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

    const noShowRate =
      totalAppointments > 0 ? noShowAppointments / totalAppointments : 0;
    const completionRate =
      totalAppointments > 0 ? completedAppointments / totalAppointments : 0;

    return {
      statusCode: 200,
      message: "Provider performance report retrieved successfully",
      data: {
        providerId,
        dateRange: { startDate, endDate },
        statistics: {
          totalAppointments,
          completedAppointments,
          noShowAppointments,
          noShowRate,
          completionRate,
          totalEncounters,
          totalPrescriptions,
          totalLabOrders,
          revenue: Number(revenue._sum.totalAmount || 0),
        },
      },
    };
  }

  /**
   * Get patient outcomes report
   */
  public static async getPatientOutcomes(
    req: Request,
    startDate?: string,
    endDate?: string,
    diagnosis?: string
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause: Prisma.DiagnosisWhereInput = {
      companyId,
    };

    if (startDate || endDate) {
      whereClause.diagnosedAt = {};
      if (startDate) whereClause.diagnosedAt.gte = new Date(startDate);
      if (endDate) whereClause.diagnosedAt.lte = new Date(endDate);
    }

    if (diagnosis) {
      whereClause.OR = [
        { diagnosisName: { contains: diagnosis, mode: "insensitive" } },
        { icdCode: { contains: diagnosis, mode: "insensitive" } },
      ];
    }

    const diagnoses = await prisma.diagnosis.findMany({
      where: whereClause,
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
      },
    });

    // Group by diagnosis
    const diagnosisGroups: Record<string, number> = {};
    diagnoses.forEach((d) => {
      const diag = d.diagnosisName || "Unknown";
      diagnosisGroups[diag] = (diagnosisGroups[diag] || 0) + 1;
    });

    return {
      statusCode: 200,
      message: "Patient outcomes report retrieved successfully",
      data: {
        dateRange: { startDate, endDate },
        totalDiagnoses: diagnoses.length,
        diagnosisBreakdown: diagnosisGroups,
        diagnoses: diagnoses.slice(0, 100), // Limit to 100 for response size
      },
    };
  }

  /**
   * Get revenue report
   */
  public static async getRevenueReport(
    req: Request,
    startDate?: string,
    endDate?: string,
    groupBy?: "service" | "provider" | "month"
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause: Prisma.ClinicBillingWhereInput = {
      status: "PAID",
    };

    if (startDate || endDate) {
      whereClause.invoiceDate = {};
      if (startDate) whereClause.invoiceDate.gte = new Date(startDate);
      if (endDate) whereClause.invoiceDate.lte = new Date(endDate);
    }

    const billings = await prisma.clinicBilling.findMany({
      where: whereClause,
      include: {
        encounter: {
          include: {
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

    let groupedData: Record<string, unknown> = {};

    switch (groupBy) {
      case "provider":
        const byProvider: Record<string, number> = {};
        billings.forEach((billing) => {
          const providerName = billing.encounter?.provider?.name || "Unknown";
          byProvider[providerName] =
            (byProvider[providerName] || 0) + Number(billing.totalAmount);
        });
        groupedData = byProvider;
        break;

      case "month":
        const byMonth: Record<string, number> = {};
        billings.forEach((billing) => {
          const month = billing.invoiceDate.toISOString().slice(0, 7); // YYYY-MM
          byMonth[month] = (byMonth[month] || 0) + Number(billing.totalAmount);
        });
        groupedData = byMonth;
        break;

      case "service":
      default:
        // Group by billing type
        const byService: Record<string, number> = {};
        billings.forEach((billing) => {
          const serviceType = billing.billingType || "General";
          byService[serviceType] =
            (byService[serviceType] || 0) + Number(billing.totalAmount);
        });
        groupedData = byService;
        break;
    }

    const totalRevenue = billings.reduce(
      (sum, b) => sum + Number(b.totalAmount),
      0
    );

    return {
      statusCode: 200,
      message: "Revenue report retrieved successfully",
      data: {
        dateRange: { startDate, endDate },
        totalRevenue,
        groupedData,
        totalInvoices: billings.length,
      },
    };
  }

  /**
   * Get lab utilization report
   */
  public static async getLabUtilization(
    req: Request,
    startDate?: string,
    endDate?: string
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause: Prisma.LabOrderWhereInput = { companyId };

    if (startDate || endDate) {
      whereClause.orderedAt = {};
      if (startDate) whereClause.orderedAt.gte = new Date(startDate);
      if (endDate) whereClause.orderedAt.lte = new Date(endDate);
    }

    const labOrders = await prisma.labOrder.findMany({
      where: whereClause,
      select: {
        id: true,
        test: {
          select: {
            testName: true,
            testCode: true,
          },
        },
        status: true,
        orderedAt: true,
      },
    });

    // Extract test names from orders
    const testCounts: Record<string, number> = {};
    labOrders.forEach((order) => {
      const testName =
        order.test?.testName || order.test?.testCode || "Unknown";
      testCounts[testName] = (testCounts[testName] || 0) + 1;
    });

    // Sort by count
    const sortedTests = Object.entries(testCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20); // Top 20

    const totalOrders = labOrders.length;
    const completedOrders = labOrders.filter(
      (o) => o.status === "COMPLETED"
    ).length;
    const utilizationRate = totalOrders > 0 ? completedOrders / totalOrders : 0;

    return {
      statusCode: 200,
      message: "Lab utilization report retrieved successfully",
      data: {
        dateRange: { startDate, endDate },
        totalOrders,
        completedOrders,
        utilizationRate,
        mostOrderedTests: sortedTests.map(([name, count]) => ({
          testName: name,
          orderCount: count,
        })),
      },
    };
  }

  /**
   * Get prescription compliance report
   */
  public static async getPrescriptionCompliance(
    req: Request,
    startDate?: string,
    endDate?: string
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause: Prisma.PrescriptionWhereInput = { companyId };

    if (startDate || endDate) {
      whereClause.prescribedAt = {};
      if (startDate) whereClause.prescribedAt.gte = new Date(startDate);
      if (endDate) whereClause.prescribedAt.lte = new Date(endDate);
    }

    const prescriptions = await prisma.prescription.findMany({
      where: whereClause,
      select: {
        id: true,
        status: true,
        refillsAllowed: true,
        refillsUsed: true,
        prescribedAt: true,
        dispensedDate: true,
      },
    });

    const totalPrescriptions = prescriptions.length;
    const fulfilledPrescriptions = prescriptions.filter(
      (p) => p.dispensedDate !== null
    ).length;
    const refillRate =
      totalPrescriptions > 0
        ? prescriptions.filter((p) => p.refillsUsed > 0).length /
          totalPrescriptions
        : 0;

    const averageRefillsUsed =
      prescriptions.length > 0
        ? prescriptions.reduce((sum, p) => sum + p.refillsUsed, 0) /
          prescriptions.length
        : 0;

    return {
      statusCode: 200,
      message: "Prescription compliance report retrieved successfully",
      data: {
        dateRange: { startDate, endDate },
        totalPrescriptions,
        fulfilledPrescriptions,
        fulfillmentRate:
          totalPrescriptions > 0
            ? fulfilledPrescriptions / totalPrescriptions
            : 0,
        refillRate,
        averageRefillsUsed,
      },
    };
  }

  /**
   * Get enhanced appointment statistics
   */
  public static async getAppointmentStatistics(
    req: Request,
    startDate?: string,
    endDate?: string,
    providerId?: string
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const whereClause: Prisma.AppointmentWhereInput = { companyId };
    if (providerId) whereClause.providerId = providerId;
    if (startDate || endDate) {
      whereClause.scheduledDate = {};
      if (startDate) whereClause.scheduledDate.gte = new Date(startDate);
      if (endDate) whereClause.scheduledDate.lte = new Date(endDate);
    }

    const [
      totalAppointments,
      appointmentsByStatus,
      appointmentsByType,
      noShowByProvider,
    ] = await Promise.all([
      prisma.appointment.count({ where: whereClause }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: whereClause,
        _count: { status: true },
      }),
      prisma.appointment.groupBy({
        by: ["appointmentType"],
        where: whereClause,
        _count: { appointmentType: true },
      }),
      providerId
        ? []
        : prisma.appointment.groupBy({
            by: ["providerId", "status"],
            where: { ...whereClause, status: "NO_SHOW" },
            _count: { providerId: true },
          }),
    ]);

    const noShowRate =
      totalAppointments > 0
        ? appointmentsByStatus.find((s) => s.status === "NO_SHOW")?._count
            .status || 0
        : 0 / totalAppointments;

    return {
      statusCode: 200,
      message: "Appointment statistics retrieved successfully",
      data: {
        totalAppointments,
        appointmentsByStatus: appointmentsByStatus.reduce(
          (acc, item) => {
            acc[item.status] = item._count.status;
            return acc;
          },
          {} as Record<string, number>
        ),
        appointmentsByType: appointmentsByType.reduce(
          (acc, item) => {
            acc[item.appointmentType] = item._count.appointmentType;
            return acc;
          },
          {} as Record<string, number>
        ),
        noShowRate,
        noShowByProvider: noShowByProvider.map((item) => ({
          providerId: item.providerId,
          noShowCount: item._count.providerId,
        })),
      },
    };
  }
}
