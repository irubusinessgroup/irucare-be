import { Paginations, QueryOptions } from "../utils/DBHelpers";
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateSupplierRequest,
  UpdateSupplierRequest,
  SupplierResponse,
  IResponse,
  IPaged,
} from "../utils/interfaces/common";

export class SupplierService {
  static async createSupplier(
    data: CreateSupplierRequest,
    companyId: string,
  ): Promise<IResponse<SupplierResponse>> {
    const existingSupplier = await prisma.suppliers.findUnique({
      where: { email: data.email },
    });

    if (existingSupplier) {
      throw new AppError("Supplier with this email already exists", 404);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new AppError("Company not found", 404);
    }

    const supplier = await prisma.suppliers.create({
      data: {
        ...data,
        companyId: companyId,
      },
      include: { company: true },
    });

    return {
      statusCode: 200,
      message: "Supplier Created successfully",
      data: supplier,
    };
  }

  static async getSupplier(
    id: string,
    companyId: string,
  ): Promise<IResponse<SupplierResponse>> {
    const supplier = await prisma.suppliers.findUnique({
      where: { id, companyId: companyId },
      include: { company: true },
    });

    if (!supplier) {
      throw new AppError("Supplier is not found", 404);
    }

    return {
      statusCode: 200,
      message: "Supplier fetched successfully",
      data: supplier,
    };
  }

  static async updateSupplier(
    id: string,
    data: UpdateSupplierRequest,
  ): Promise<IResponse<SupplierResponse>> {
    const existingSupplier = await prisma.suppliers.findUnique({
      where: { id },
      include: { company: true },
    });

    if (!existingSupplier) {
      throw new AppError("Supplier is not found", 404);
    }

    if (data.email && data.email !== existingSupplier.email) {
      const emailExists = await prisma.suppliers.findUnique({
        where: { email: data.email },
      });
      if (emailExists) {
        throw new AppError("Supplier with this email already exists", 404);
      }
    }

    const updatedSupplier = await prisma.suppliers.update({
      where: { id },
      data,
      include: { company: true },
    });

    return {
      statusCode: 200,
      message: "Supplier updated successfully",
      data: updatedSupplier,
    };
  }

  static async deleteSupplier(id: string): Promise<void> {
    const supplier = await prisma.suppliers.findUnique({
      where: { id },
      include: {
        stock: true,
      },
    });

    if (!supplier) {
      throw new AppError("Supplier is not found", 404);
    }

    if (supplier.stock.length > 0) {
      throw new AppError(
        "Cannot delete supplier with existing transactions",
        404,
      );
    }

    await prisma.suppliers.delete({
      where: { id },
    });
  }

  static async getSuppliers(
    companyId: string,
    searchq?: string,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<SupplierResponse[]>> {
    try {
      const searchOptions = QueryOptions(
        ["supplier_name", "contact_person", "email"],
        searchq,
      );

      const pagination = Paginations(currentPage, limit);

      const suppliers = await prisma.suppliers.findMany({
        where: {
          ...searchOptions,
          companyId: companyId,
        },
        ...pagination,
        orderBy: { createdAt: "desc" },
        include: { company: true },
      });

      const totalItems = await prisma.suppliers.count({
        where: { companyId: companyId, ...searchOptions },
      });

      return {
        statusCode: 200,
        message: "Suppliers fetched successfully",
        data: suppliers,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 15,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
