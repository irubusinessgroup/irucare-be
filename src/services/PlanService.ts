import { BaseService } from "./Service";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreatePlanDto,
  IResponse,
  Paged,
  TPlan,
  UpdatePlanDto,
} from "../utils/interfaces/common";
import type { Prisma } from "@prisma/client";

export class PlanService extends BaseService {
  public static async createPlan(
    data: CreatePlanDto,
  ): Promise<IResponse<TPlan>> {
    try {
      // Normalize features so both objects and strings are supported
      const normalizedFeatures = data.features?.map((f) =>
        typeof f === "string" ? f : JSON.stringify(f),
      );

      const createData: Prisma.PlanCreateInput = {
        ...(data.id ? { id: data.id } : {}),
        name: data.name,
        description: data.description ?? undefined,
        price: data.price,
        setupFee: data.setupFee ?? undefined,
        additionalUser: data.additionalUser ?? undefined,
        additionalLocation: data.additionalLocation ?? undefined,
        features: normalizedFeatures ?? undefined,
        period: data.period ?? undefined,
        userRange: data.userRange ?? undefined,
        locationRange: data.locationRange ?? undefined,
        isActive: data.isActive ?? true,
      };

      const plan = await prisma.plan.create({
        data: createData,
      });
      return {
        statusCode: 201,
        message: "Plan created successfully",
        data: plan,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getPlan(id: string): Promise<IResponse<TPlan | null>> {
    try {
      const plan = await prisma.plan.findUnique({ where: { id } });
      return {
        statusCode: 200,
        message: "Plan fetched successfully",
        data: plan,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getAllPlans(
    page = 1,
    limit = 20,
    onlyPublished = false,
  ): Promise<Paged<TPlan[]>> {
    try {
      const skip = (page - 1) * limit;
      // The Plan model uses `isActive` — use that field for filtering published plans
      const where = onlyPublished ? { isActive: true } : undefined;
      const [plans, totalItems] = await prisma.$transaction([
        prisma.plan.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
        }),
        prisma.plan.count({ where }),
      ]);

      return {
        statusCode: 200,
        message: "Plans fetched successfully",
        data: plans as TPlan[],
        totalItems,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updatePlan(
    id: string,
    data: UpdatePlanDto,
  ): Promise<IResponse<TPlan>> {
    try {
      // Normalize features for update as well
      const normalizedFeatures = data.features?.map((f) =>
        typeof f === "string" ? f : JSON.stringify(f),
      );

      const updateData = {
        ...data,
        features: normalizedFeatures,
      } as Prisma.PlanUpdateInput;

      const updated = await prisma.plan.update({
        where: { id },
        data: updateData,
      });
      return {
        statusCode: 200,
        message: "Plan updated successfully",
        data: updated,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deletePlan(id: string): Promise<IResponse<null>> {
    try {
      await prisma.plan.delete({ where: { id } });
      return {
        statusCode: 200,
        message: "Plan deleted successfully",
        data: null,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
