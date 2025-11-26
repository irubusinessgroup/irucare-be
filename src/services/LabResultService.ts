import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  BulkCreateResultsDto,
  CreateLabResultDto,
  IResponse,
  UpdateLabResultDto,
} from "../utils/interfaces/common";
import { Prisma } from "@prisma/client";

export class LabResultService {
  /**
   * Create single lab result
   */
  public static async create(
    req: Request,
    dto: CreateLabResultDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify lab order exists
    const labOrder = await prisma.labOrder.findFirst({
      where: { id: dto.labOrderId, companyId },
    });

    if (!labOrder) throw new AppError("Lab order not found", 404);

    if (labOrder.status !== "IN_PROGRESS") {
      throw new AppError("Lab order must be in progress to enter results", 409);
    }

    const result = await prisma.labResult.create({
      data: {
        labOrderId: dto.labOrderId,
        patientId: labOrder.patientId,
        companyId,
        testParameter: dto.testParameter,
        result: dto.result,
        unit: dto.unit,
        referenceRange: dto.referenceRange,
        isAbnormal: dto.isAbnormal || false,
        abnormalFlag: dto.abnormalFlag,
        notes: dto.notes,
        enteredBy: userId,
      },
      include: {
        labOrder: {
          include: {
            test: true,
            patient: true,
          },
        },
      },
    });

    return {
      statusCode: 201,
      message: "Lab result created successfully",
      data: result,
    };
  }

  /**
   * Bulk create lab results for an order
   */
  public static async bulkCreate(
    req: Request,
    dto: BulkCreateResultsDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify lab order exists
    const labOrder = await prisma.labOrder.findFirst({
      where: { id: dto.labOrderId, companyId },
    });

    if (!labOrder) throw new AppError("Lab order not found", 404);

    if (labOrder.status !== "IN_PROGRESS") {
      throw new AppError("Lab order must be in progress to enter results", 409);
    }

    const results = await prisma.$transaction(
      dto.results.map((r) =>
        prisma.labResult.create({
          data: {
            labOrderId: dto.labOrderId,
            patientId: labOrder.patientId,
            companyId,
            testParameter: r.testParameter,
            result: r.result,
            unit: r.unit,
            referenceRange: r.referenceRange,
            isAbnormal: r.isAbnormal || false,
            abnormalFlag: r.abnormalFlag,
            enteredBy: userId,
          },
        }),
      ),
    );

    return {
      statusCode: 201,
      message: "Lab results created successfully",
      data: results,
    };
  }

  /**
   * Update lab result
   */
  public static async update(
    id: string,
    dto: UpdateLabResultDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.labResult.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab result not found", 404);

    // Don't allow updates to approved results
    if (existing.approvedBy) {
      throw new AppError("Cannot update approved results", 409);
    }

    const updated = await prisma.labResult.update({
      where: { id },
      data: {
        result: dto.result,
        unit: dto.unit,
        referenceRange: dto.referenceRange,
        isAbnormal: dto.isAbnormal,
        abnormalFlag: dto.abnormalFlag,
        notes: dto.notes,
      },
      include: {
        labOrder: {
          include: {
            test: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Lab result updated successfully",
      data: updated,
    };
  }

  /**
   * Approve lab results
   */
  public static async approve(
    labOrderId: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Verify lab order exists
    const labOrder = await prisma.labOrder.findFirst({
      where: { id: labOrderId, companyId },
      include: {
        results: true,
        test: true,
      },
    });

    if (!labOrder) throw new AppError("Lab order not found", 404);

    if (labOrder.results.length === 0) {
      throw new AppError("No results to approve", 400);
    }

    // Update all results and lab order in transaction
    await prisma.$transaction(async (tx) => {
      // Approve all results
      await tx.labResult.updateMany({
        where: {
          labOrderId,
          approvedBy: null,
        },
        data: {
          approvedBy: userId,
          approvedAt: new Date(),
        },
      });

      // Complete lab order
      await tx.labOrder.update({
        where: { id: labOrderId },
        data: {
          status: "COMPLETED",
        },
      });

      // Record turnaround time
      if (labOrder.sampleCollectedAt) {
        const now = new Date();
        const collectionToEntry = labOrder.results[0]?.resultDate
          ? Math.floor(
              (labOrder.results[0].resultDate.getTime() -
                labOrder.sampleCollectedAt.getTime()) /
                60000,
            )
          : null;
        const entryToApproval = labOrder.results[0]?.resultDate
          ? Math.floor(
              (now.getTime() - labOrder.results[0].resultDate.getTime()) /
                60000,
            )
          : null;
        const totalTurnaround = Math.floor(
          (now.getTime() - labOrder.sampleCollectedAt.getTime()) / 60000,
        );

        await tx.labTurnaroundStats.create({
          data: {
            companyId,
            testId: labOrder.testId,
            orderDate: labOrder.orderedAt,
            sampleCollectedAt: labOrder.sampleCollectedAt,
            resultEnteredAt: labOrder.results[0]?.resultDate,
            resultApprovedAt: now,
            collectionToEntry,
            entryToApproval,
            totalTurnaround,
            targetTime: labOrder.test?.turnaroundTime
              ? labOrder.test.turnaroundTime * 60
              : null,
            isWithinTarget: labOrder.test?.turnaroundTime
              ? totalTurnaround <= labOrder.test.turnaroundTime * 60
              : true,
          },
        });
      }
    });

    const updated = await prisma.labOrder.findFirst({
      where: { id: labOrderId },
      include: {
        results: {
          include: {
            approvedByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Lab results approved successfully",
      data: updated,
    };
  }

  /**
   * Get results for a lab order
   */
  public static async getByLabOrderId(
    labOrderId: string,
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const results = await prisma.labResult.findMany({
      where: {
        labOrderId,
        companyId,
      },
      orderBy: { resultDate: "desc" },
      include: {
        enteredByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        approvedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Lab results fetched successfully",
      data: results,
    };
  }

  /**
   * Get patient's lab results history
   */
  public static async getPatientHistory(
    patientId: string,
    req: Request,
    testParameter?: string,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const where: Prisma.LabResultWhereInput = {
      patientId,
      companyId,
      approvedBy: { not: null }, // Only approved results
    };

    if (testParameter) {
      where.testParameter = testParameter;
    }

    const results = await prisma.labResult.findMany({
      where,
      orderBy: { resultDate: "desc" },
      take: 50, // Limit to recent 50 results
      include: {
        labOrder: {
          include: {
            test: true,
            encounter: {
              select: {
                id: true,
                visitNumber: true,
                visitType: true,
              },
            },
          },
        },
      },
    });

    return {
      statusCode: 200,
      message: "Lab results history fetched successfully",
      data: results,
    };
  }

  /**
   * Delete lab result
   */
  public static async remove(
    id: string,
    req: Request,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.labResult.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab result not found", 404);

    // Don't allow deletion of approved results
    if (existing.approvedBy) {
      throw new AppError("Cannot delete approved results", 409);
    }

    await prisma.labResult.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Lab result deleted successfully",
    };
  }
}
