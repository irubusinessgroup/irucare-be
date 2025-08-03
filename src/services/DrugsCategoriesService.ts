import { prisma } from "../utils/client";
import {
  CreateDrugsCategoryDto,
  UpdateDrugsCategoryDto,
} from "../utils/interfaces/common";
import { QueryOptions, Paginations } from "../utils/DBHelpers";
import type { Request } from "express";
import AppError from "../utils/error";

export class DrugsCategoriesService {
  public static async getAllDrugsCategories(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const queryOptions = QueryOptions(["name"], searchq);
      const pagination = Paginations(page, limit);

      const categories = await prisma.drugsCategories.findMany({
        where: { companyId, ...queryOptions },
        ...pagination,
        orderBy: { createdAt: "desc" },
      });

      const totalItems = await prisma.drugsCategories.count({
        where: { companyId, ...queryOptions },
      });

      return {
        data: categories,
        totalItems,
        currentPage: page || 1,
        itemsPerPage: limit || 15,
        message: "Drugs categories retrieved successfully",
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async createDrugsCategory(
    data: CreateDrugsCategoryDto,
    companyId: string,
  ) {
    try {
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const category = await prisma.drugsCategories.create({
        data: {
          ...data,
          companyId,
        },
      });
      return { message: "Drugs category created successfully", data: category };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateDrugsCategory(
    id: string,
    data: UpdateDrugsCategoryDto,
  ) {
    try {
      const category = await prisma.drugsCategories.update({
        where: { id },
        data,
      });
      return { message: "Drugs category updated successfully", data: category };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteDrugsCategory(id: string) {
    try {
      await prisma.drugsCategories.delete({ where: { id } });
      return { message: "Drugs category deleted successfully" };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
