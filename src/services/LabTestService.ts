import type { Request } from "express";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type {
  CreateLabTestDto,
  IPaged,
  IResponse,
  LabTestFilters,
  UpdateLabTestDto,
} from "../utils/interfaces/common";
import { Prisma } from "@prisma/client";

export class LabTestService {
  /**
   * List lab tests with filters
   */
  public static async list(
    req: Request,
    page?: number,
    limit?: number,
    filters?: LabTestFilters,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 50;
    const skip = (pageNum - 1) * limitNum;

    const searchWhere = filters?.search
      ? {
          OR: [
            {
              testCode: {
                contains: filters.search,
                mode: "insensitive" as Prisma.QueryMode,
              },
            },
            {
              testName: {
                contains: filters.search,
                mode: "insensitive" as Prisma.QueryMode,
              },
            },
            {
              description: {
                contains: filters.search,
                mode: "insensitive" as Prisma.QueryMode,
              },
            },
          ],
        }
      : {};

    const where = {
      companyId,
      category: filters?.category,
      testType: filters?.testType,
      isActive: filters?.isActive !== undefined ? filters.isActive : true,
      ...searchWhere,
    };

    const [data, totalItems] = await Promise.all([
      prisma.labTest.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ category: "asc" }, { testName: "asc" }],
        include: {
          createdByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.labTest.count({ where }),
    ]);

    return {
      data,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      statusCode: 200,
      message: "Lab tests fetched successfully",
    };
  }

  /**
   * Get lab test by ID
   */
  public static async getById(
    id: string,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const labTest = await prisma.labTest.findFirst({
      where: { id, companyId },
      include: {
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!labTest) {
      throw new AppError("Lab test not found", 404);
    }

    return {
      statusCode: 200,
      message: "Lab test fetched successfully",
      data: labTest,
    };
  }

  /**
   * Create lab test
   */
  public static async create(
    req: Request,
    dto: CreateLabTestDto,
  ): Promise<IResponse<unknown>> {
    const userId = req.user?.id;
    const companyId = req.user?.company?.companyId;
    if (!userId || !companyId) throw new AppError("Not Authorized", 401);

    // Check if test code already exists
    const existing = await prisma.labTest.findFirst({
      where: {
        companyId,
        testCode: dto.testCode,
      },
    });

    if (existing) {
      throw new AppError("Lab test with this code already exists", 409);
    }

    const created = await prisma.labTest.create({
      data: {
        companyId,
        testCode: dto.testCode,
        testName: dto.testName,
        testType: dto.testType || "SINGLE",
        category: dto.category,
        description: dto.description,
        sampleType: dto.sampleType,
        sampleVolume: dto.sampleVolume,
        turnaroundTime: dto.turnaroundTime,
        price: dto.price || 0,
        panelTests: dto.panelTests as any,
        referenceRanges: dto.referenceRanges as any,
        requiresApproval: dto.requiresApproval || false,
        createdBy: userId,
      },
    });

    return {
      statusCode: 201,
      message: "Lab test created successfully",
      data: created,
    };
  }

  /**
   * Update lab test
   */
  public static async update(
    id: string,
    dto: UpdateLabTestDto,
    req: Request,
  ): Promise<IResponse<unknown>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.labTest.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab test not found", 404);

    // Check if test code is being changed and if it conflicts
    if (dto.testCode && dto.testCode !== existing.testCode) {
      const duplicate = await prisma.labTest.findFirst({
        where: {
          companyId,
          testCode: dto.testCode,
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new AppError("Lab test with this code already exists", 409);
      }
    }

    const updated = await prisma.labTest.update({
      where: { id },
      data: {
        testCode: dto.testCode,
        testName: dto.testName,
        testType: dto.testType,
        category: dto.category,
        description: dto.description,
        sampleType: dto.sampleType,
        sampleVolume: dto.sampleVolume,
        turnaroundTime: dto.turnaroundTime,
        price: dto.price,
        panelTests: dto.panelTests as any,
        referenceRanges: dto.referenceRanges as any,
        requiresApproval: dto.requiresApproval,
        isActive: dto.isActive,
      },
    });

    return {
      statusCode: 200,
      message: "Lab test updated successfully",
      data: updated,
    };
  }

  /**
   * Delete lab test
   */
  public static async remove(
    id: string,
    req: Request,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const existing = await prisma.labTest.findFirst({
      where: { id, companyId },
    });

    if (!existing) throw new AppError("Lab test not found", 404);

    // Check if test has any orders
    const orderCount = await prisma.labOrder.count({
      where: { testId: id },
    });

    if (orderCount > 0) {
      // Soft delete - deactivate instead
      await prisma.labTest.update({
        where: { id },
        data: { isActive: false },
      });

      return {
        statusCode: 200,
        message: "Lab test deactivated (has existing orders)",
      };
    }

    // Hard delete if no orders
    await prisma.labTest.delete({ where: { id } });

    return {
      statusCode: 200,
      message: "Lab test deleted successfully",
    };
  }

  /**
   * Get lab test categories
   */
  public static async getCategories(
    req: Request,
  ): Promise<IResponse<string[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const tests = await prisma.labTest.findMany({
      where: { companyId, isActive: true },
      select: { category: true },
      distinct: ["category"],
    });

    const categories = tests
      .map((t) => t.category)
      .filter(Boolean)
      .sort();

    return {
      statusCode: 200,
      message: "Categories fetched successfully",
      data: categories,
    };
  }

  /**
   * Get panels and profiles
   */
  public static async getPanelsAndProfiles(
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const panels = await prisma.labTest.findMany({
      where: {
        companyId,
        testType: { in: ["PANEL", "PROFILE"] },
        isActive: true,
      },
      orderBy: { testName: "asc" },
    });

    return {
      statusCode: 200,
      message: "Panels and profiles fetched successfully",
      data: panels,
    };
  }

  /**
   * Get pricing list
   */
  public static async getPricingList(
    req: Request,
  ): Promise<IResponse<unknown[]>> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID required", 400);

    const tests = await prisma.labTest.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        testCode: true,
        testName: true,
        category: true,
        testType: true,
        price: true,
        turnaroundTime: true,
      },
      orderBy: [{ category: "asc" }, { testName: "asc" }],
    });

    return {
      statusCode: 200,
      message: "Pricing list fetched successfully",
      data: tests,
    };
  }
}
