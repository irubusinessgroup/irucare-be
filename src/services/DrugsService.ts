import { prisma } from "../utils/client";
import { CreateDrugDto, UpdateDrugDto } from "../utils/interfaces/common";
import { QueryOptions, Paginations } from "../utils/DBHelpers";
import { Request } from "express";
import AppError from "../utils/error";

export class DrugsService {
  public static async getAllDrugs(
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

      const queryOptions = QueryOptions(["drugCode", "designation"], searchq);
      const pagination = Paginations(page, limit);

      const drugs = await prisma.drugs.findMany({
        where: { companyId, ...queryOptions },
        include: { company: true, drugCategory: true },
        ...pagination,
        orderBy: { createdAt: "desc" },
      });

      const totalItems = await prisma.drugs.count({
        where: { companyId, ...queryOptions },
      });

      return {
        data: drugs,
        totalItems,
        currentPage: page || 1,
        itemsPerPage: limit || 15,
        message: "Drugs retrieved successfully",
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async createDrug(data: CreateDrugDto, companyId: string) {
    try {
      const drug = await prisma.drugs.create({
        data: {
          ...data,
          companyId,
        },
      });
      return { message: "Drug created successfully", data: drug };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateDrug(id: string, data: UpdateDrugDto) {
    try {
      const drug = await prisma.drugs.update({ where: { id }, data });
      return { message: "Drug updated successfully", data: drug };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async deleteDrug(id: string) {
    try {
      await prisma.drugs.delete({ where: { id } });
      return { message: "Drug deleted successfully" };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
