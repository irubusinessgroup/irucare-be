import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { IPaged, IResponse } from "../utils/interfaces/common";
import type { LabResultItem } from "../utils/interfaces/common";
import type { Prisma } from "@prisma/client";

export interface LabResultTemplate {
  testCode: string;
  testName: string;
  specimen: string;
  referenceRange: string;
  unit: string;
  normalValues: {
    min: number;
    max: number;
  };
}

export class LabResultsService {
  /**
   * Add or update lab results for a lab order
   */
  public static async addResults(
    labOrderId: string,
    results: LabResultItem[],
  ): Promise<IResponse<unknown>> {
    const labOrder = await prisma.labOrder.findUnique({
      where: { id: labOrderId },
    });

    if (!labOrder) {
      throw new AppError("Lab order not found", 404);
    }

    if (labOrder.status === "CANCELLED") {
      throw new AppError("Cannot add results to cancelled lab order", 409);
    }

    // Validate and process results
    const processedResults = results.map((result) => {
      const processed: LabResultItem & {
        status?: "NORMAL" | "ABNORMAL" | "CRITICAL";
        reportedDate?: string;
      } = { ...result };

      // Calculate status based on value and reference range
      if (result.value !== null && result.refRange) {
        processed.status = this.calculateResultStatus(
          result.value,
          result.refRange,
          result.flag,
        );
      }

      processed.reportedDate = new Date().toISOString();
      return processed;
    });

    // Update lab order with results
    const updated = await prisma.labOrder.update({
      where: { id: labOrderId },
      data: {
        results: processedResults as unknown as object[],
        status: "COMPLETED",
        completedDate: new Date(),
      },
    });

    return {
      statusCode: 200,
      message: "Lab results added successfully",
      data: updated,
    };
  }

  /**
   * Get all results for a lab order
   */
  public static async getResults(
    labOrderId: string,
  ): Promise<IResponse<unknown>> {
    const labOrder = await prisma.labOrder.findUnique({
      where: { id: labOrderId },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            patientNO: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!labOrder) {
      throw new AppError("Lab order not found", 404);
    }

    return {
      statusCode: 200,
      message: "Lab results retrieved successfully",
      data: {
        labOrder: {
          id: labOrder.id,
          orderType: labOrder.orderType,
          status: labOrder.status,
          orderedDate: labOrder.orderedDate,
          completedDate: labOrder.completedDate,
        },
        results: labOrder.results,
        patient: labOrder.patient,
        provider: labOrder.provider,
      },
    };
  }

  /**
   * Get all lab results for a patient
   */
  public static async getPatientResults(
    patientId: string,
    page?: number,
    limit?: number,
    filters?: {
      testName?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<IPaged<unknown[]>> {
    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const where: Prisma.LabOrderWhereInput = {
      patientId,
      status: "COMPLETED",
    };

    if (filters?.startDate || filters?.endDate) {
      where.completedDate = {};
      if (filters.startDate) {
        where.completedDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.completedDate.lte = new Date(filters.endDate);
      }
    }

    const [data, totalItems] = await Promise.all([
      prisma.labOrder.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { completedDate: "desc" },
        select: {
          id: true,
          orderType: true,
          status: true,
          orderedDate: true,
          completedDate: true,
          results: true,
          provider: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.labOrder.count({ where }),
    ]);

    // Filter by test name if provided
    let filteredData = data;
    if (filters?.testName) {
      filteredData = data.filter((order) => {
        const results = order.results as unknown as LabResultItem[];
        return results.some(
          (r) =>
            r.name.toLowerCase().includes(filters.testName!.toLowerCase()) ||
            r.code.toLowerCase().includes(filters.testName!.toLowerCase()),
        );
      });
    }

    return {
      data: filteredData,
      totalItems: filters?.testName ? filteredData.length : totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Patient lab results retrieved successfully",
    };
  }

  /**
   * Compare results across multiple lab orders
   */
  public static async compareResults(
    patientId: string,
    testCode: string,
    startDate?: string,
    endDate?: string,
  ): Promise<IResponse<unknown>> {
    const where: Prisma.LabOrderWhereInput = {
      patientId,
      status: "COMPLETED",
    };

    if (startDate || endDate) {
      where.completedDate = {};
      if (startDate) {
        where.completedDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.completedDate.lte = new Date(endDate);
      }
    }

    const labOrders = await prisma.labOrder.findMany({
      where,
      orderBy: { completedDate: "asc" },
      select: {
        id: true,
        completedDate: true,
        results: true,
      },
    });

    // Extract results for the specified test code
    const comparisonData = labOrders
      .map((order) => {
        const results = order.results as unknown as LabResultItem[];
        const testResult = results.find((r) => r.code === testCode);
        if (!testResult) return null;

        return {
          labOrderId: order.id,
          date: order.completedDate,
          result: testResult,
        };
      })
      .filter((item) => item !== null);

    // Calculate trends
    const values = comparisonData
      .map((item) => {
        if (!item) return null;
        const numValue =
          typeof item.result.value === "number"
            ? item.result.value
            : parseFloat(String(item.result.value));
        return isNaN(numValue) ? null : numValue;
      })
      .filter((v) => v !== null) as number[];

    const trends = {
      count: comparisonData.length,
      firstValue: values[0] ?? null,
      lastValue: values[values.length - 1] ?? null,
      average:
        values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
      trend:
        values.length >= 2
          ? values[values.length - 1] > values[0]
            ? "INCREASING"
            : values[values.length - 1] < values[0]
              ? "DECREASING"
              : "STABLE"
          : null,
    };

    return {
      statusCode: 200,
      message: "Results comparison retrieved successfully",
      data: {
        testCode,
        comparison: comparisonData,
        trends,
      },
    };
  }

  /**
   * Get result templates by test type
   */
  public static async getResultTemplates(): Promise<
    IResponse<LabResultTemplate[]>
  > {
    // Common lab test templates
    const templates: LabResultTemplate[] = [
      {
        testCode: "CBC",
        testName: "Complete Blood Count",
        specimen: "Whole Blood",
        referenceRange: "See individual parameters",
        unit: "Various",
        normalValues: { min: 0, max: 0 },
      },
      {
        testCode: "GLUCOSE",
        testName: "Blood Glucose",
        specimen: "Serum/Plasma",
        referenceRange: "70-100 mg/dL (Fasting)",
        unit: "mg/dL",
        normalValues: { min: 70, max: 100 },
      },
      {
        testCode: "CHOLESTEROL",
        testName: "Total Cholesterol",
        specimen: "Serum",
        referenceRange: "<200 mg/dL",
        unit: "mg/dL",
        normalValues: { min: 0, max: 200 },
      },
      {
        testCode: "CREATININE",
        testName: "Serum Creatinine",
        specimen: "Serum",
        referenceRange: "0.6-1.2 mg/dL (Male), 0.5-1.1 mg/dL (Female)",
        unit: "mg/dL",
        normalValues: { min: 0.5, max: 1.2 },
      },
      {
        testCode: "ALT",
        testName: "Alanine Aminotransferase",
        specimen: "Serum",
        referenceRange: "7-56 U/L",
        unit: "U/L",
        normalValues: { min: 7, max: 56 },
      },
    ];

    return {
      statusCode: 200,
      message: "Result templates retrieved successfully",
      data: templates,
    };
  }

  /**
   * Calculate result status based on value and reference range
   */
  private static calculateResultStatus(
    value: string | number | null,
    refRange: string,
    flag?: "LOW" | "HIGH" | "CRITICAL" | "NORMAL",
  ): "NORMAL" | "ABNORMAL" | "CRITICAL" {
    if (value === null) return "NORMAL";

    // If flag is provided, use it
    if (flag === "CRITICAL") return "CRITICAL";
    if (flag === "LOW" || flag === "HIGH") return "ABNORMAL";
    if (flag === "NORMAL") return "NORMAL";

    // Try to parse reference range (e.g., "70-100", "<200", ">5")
    const numValue =
      typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(numValue)) return "NORMAL";

    // Parse range patterns
    const rangeMatch = refRange.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
    if (rangeMatch) {
      const min = parseFloat(rangeMatch[1]);
      const max = parseFloat(rangeMatch[2]);
      if (numValue < min || numValue > max) {
        // Check if critical (far outside range)
        const range = max - min;
        const criticalThreshold = range * 0.5;
        if (
          numValue < min - criticalThreshold ||
          numValue > max + criticalThreshold
        ) {
          return "CRITICAL";
        }
        return "ABNORMAL";
      }
      return "NORMAL";
    }

    // Less than pattern (e.g., "<200")
    const lessThanMatch = refRange.match(/<\s*(\d+\.?\d*)/);
    if (lessThanMatch) {
      const max = parseFloat(lessThanMatch[1]);
      if (numValue >= max) {
        return numValue >= max * 1.5 ? "CRITICAL" : "ABNORMAL";
      }
      return "NORMAL";
    }

    // Greater than pattern (e.g., ">5")
    const greaterThanMatch = refRange.match(/>\s*(\d+\.?\d*)/);
    if (greaterThanMatch) {
      const min = parseFloat(greaterThanMatch[1]);
      if (numValue <= min) {
        return numValue <= min * 0.5 ? "CRITICAL" : "ABNORMAL";
      }
      return "NORMAL";
    }

    return "NORMAL";
  }
}
