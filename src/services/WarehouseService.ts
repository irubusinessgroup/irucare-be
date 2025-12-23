import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  IPaged,
  IResponse,
  WarehouseResponse,
  CreateWarehouseRequest,
  UpdateWarehouseRequest,
} from "../utils/interfaces/common";
import { Paginations, QueryOptions } from "../utils/DBHelpers";

export class WarehouseService {
  static async createWarehouse(
    data: CreateWarehouseRequest,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<WarehouseResponse>> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const existingWarehouse = await prisma.warehouse.findFirst({
      where: {
        warehousename: data.warehousename,
        companyId: companyId,
      },
    });

    if (existingWarehouse) {
      throw new AppError("Warehouse with this name already exists", 400);
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        warehousename: data.warehousename,
        description: data.description,
        companyId: companyId,
        branchId: branchId,
      },
    });

    return {
      statusCode: 201,
      message: "Warehouse created successfully",
      data: warehouse,
    };
  }

  static async getWarehouseById(
    warehouseId: string,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<WarehouseResponse>> {
    const where: any = {
      id: warehouseId,
      companyId: companyId,
    };
    if (branchId) {
      where.branchId = branchId;
    }

    const warehouse = await prisma.warehouse.findFirst({
      where,
    });

    if (!warehouse) {
      throw new AppError("Warehouse not found", 404);
    }

    return {
      statusCode: 200,
      message: "Warehouse fetched successfully",
      data: warehouse,
    };
  }

  static async updateWarehouse(
    warehouseId: string,
    data: UpdateWarehouseRequest,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<WarehouseResponse>> {
    const where: any = {
      id: warehouseId,
      companyId: companyId,
    };
    if (branchId) {
      where.branchId = branchId;
    }

    const existingWarehouse = await prisma.warehouse.findFirst({
      where,
    });

    if (!existingWarehouse) {
      throw new AppError("Warehouse not found", 404);
    }

    if (
      data.warehousename &&
      data.warehousename !== existingWarehouse.warehousename
    ) {
      const nameExists = await prisma.warehouse.findFirst({
        where: {
          warehousename: data.warehousename,
          companyId: companyId,
          NOT: { id: warehouseId },
        },
      });

      if (nameExists) {
        throw new AppError("Warehouse with this name already exists", 400);
      }
    }

    const updatedWarehouse = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        warehousename: data.warehousename,
        description: data.description,
      },
    });

    return {
      statusCode: 200,
      message: "Warehouse updated successfully",
      data: updatedWarehouse,
    };
  }

  static async deleteWarehouse(
    warehouseId: string,
    companyId: string,
    branchId?: string | null,
  ): Promise<IResponse<null>> {
    const where: any = {
      id: warehouseId,
      companyId: companyId,
    };
    if (branchId) {
      where.branchId = branchId;
    }

    const warehouse = await prisma.warehouse.findFirst({
      where,
      include: { stockReceipts: true },
    });

    if (!warehouse) {
      throw new AppError("Warehouse not found", 404);
    }

    if (warehouse.stockReceipts.length > 0) {
      throw new AppError("Cannot delete Warehouse with existing items", 400);
    }

    await prisma.warehouse.delete({
      where: { id: warehouseId },
    });

    return {
      statusCode: 200,
      message: "Warehouse deleted successfully",
    };
  }

  static async getWarehouse(
    companyId: string,
    branchId?: string | null,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<WarehouseResponse[]>> {
    try {
      const searchOptions = QueryOptions(
        ["warehousename", "description"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const categories = await prisma.warehouse.findMany({
        where: {
          ...searchOptions,
          companyId: companyId,
          ...(branchId ? { branchId } : {}),
        },
        ...pagination,
        orderBy: { warehousename: "asc" },
      });

      const totalItems = await prisma.warehouse.count({
        where: {
          ...searchOptions,
          companyId: companyId,
          ...(branchId ? { branchId } : {}),
        },
      });

      return {
        statusCode: 200,
        message: "Warehouse fetched successfully",
        data: categories,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
