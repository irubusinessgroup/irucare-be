import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from "../utils/interfaces/common";
import type { Request } from "express";

export class SupplierService {
  public static async getAllSuppliers(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const queryOptions = searchq
      ? {
          companyId,
          OR: [
            { full_names: { contains: searchq } },
            { phone_number: { contains: searchq } },
          ],
        }
      : { companyId };
    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const suppliers = await prisma.supplier.findMany({
      where: queryOptions,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.supplier.count({ where: queryOptions });

    return {
      data: suppliers,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || suppliers.length,
      message: "Suppliers retrieved successfully",
    };
  }

  public static async createSupplier(
    data: CreateSupplierDto,
    companyId: string,
  ) {
    const supplier = await prisma.supplier.create({
      data: {
        full_names: data.full_names,
        phone_number: data.phone_number,
        location: data.location,
        companyId,
      },
    });

    return { message: "Supplier created successfully", data: supplier };
  }

  public static async updateSupplier(id: string, data: UpdateSupplierDto) {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        full_names: data.full_names,
        phone_number: data.phone_number,
        location: data.location,
      },
    });

    return { message: "Supplier updated successfully", data: supplier };
  }

  public static async deleteSupplier(id: string) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new AppError("Supplier not found", 404);

    await prisma.supplier.delete({ where: { id } });

    return { message: "Supplier deleted successfully" };
  }
}
