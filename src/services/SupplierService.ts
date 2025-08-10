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
  // public static async getAllSuppliers(
  //   req: Request,
  //   searchq?: string,
  //   limit?: number,
  //   page?: number,
  // ) {
  //   const companyId = req.user?.company?.companyId;
  //   if (!companyId) {
  //     throw new AppError("Company ID is missing", 400);
  //   }
  //   const queryOptions = searchq
  //     ? {
  //         companyId,
  //         OR: [
  //           { full_names: { contains: searchq } },
  //           { phone_number: { contains: searchq } },
  //         ],
  //       }
  //     : { companyId };
  //   const skip = page && limit ? (page - 1) * limit : undefined;
  //   const take = limit;
  //   const suppliers = await prisma.supplier.findMany({
  //     where: queryOptions,
  //     skip,
  //     take,
  //     orderBy: { createdAt: "desc" },
  //   });
  //   const totalItems = await prisma.supplier.count({ where: queryOptions });
  //   return {
  //     data: suppliers,
  //     totalItems,
  //     currentPage: page || 1,
  //     itemsPerPage: limit || suppliers.length,
  //     message: "Suppliers retrieved successfully",
  //   };
  // }
  // public static async createSupplier(
  //   data: CreateSupplierDto,
  //   companyId: string,
  // ) {
  //   const supplier = await prisma.supplier.create({
  //     data: {
  //       full_names: data.full_names,
  //       phone_number: data.phone_number,
  //       location: data.location,
  //       companyId,
  //     },
  //   });
  //   return { message: "Supplier created successfully", data: supplier };
  // }
  // public static async updateSupplier(id: string, data: UpdateSupplierDto) {
  //   const supplier = await prisma.supplier.update({
  //     where: { id },
  //     data: {
  //       full_names: data.full_names,
  //       phone_number: data.phone_number,
  //       location: data.location,
  //     },
  //   });
  //   return { message: "Supplier updated successfully", data: supplier };
  // }
  // public static async deleteSupplier(id: string) {
  //   const supplier = await prisma.supplier.findUnique({ where: { id } });
  //   if (!supplier) throw new AppError("Supplier not found", 404);
  //   await prisma.supplier.delete({ where: { id } });
  //   return { message: "Supplier deleted successfully" };
  // }

  static async createSupplier(
    data: CreateSupplierRequest,
    userId: string,
  ): Promise<IResponse<SupplierResponse>> {
    const existingSupplier = await prisma.suppliers.findUnique({
      where: { email: data.email },
    });

    if (existingSupplier) {
      throw new AppError("Supplier with this email already exists", 404);
    }

    const supplier = await prisma.suppliers.create({
      data: {
        ...data,
        created_by_user_id: userId,
      },
    });

    return {
      statusCode: 200,
      message: "Supplier Created successfully",
      data: this.mapToSupplierResponse(supplier),
    };
  }

  static async getSupplier(id: string): Promise<IResponse<SupplierResponse>> {
    const supplier = await prisma.suppliers.findUnique({
      where: { id },
    });

    if (!supplier) {
      throw new AppError("Supplier is not found", 404);
    }

    return {
      statusCode: 200,
      message: "Supplier fetched successfully",
      data: this.mapToSupplierResponse(supplier),
    };
  }

  static async updateSupplier(
    id: string,
    data: UpdateSupplierRequest,
  ): Promise<IResponse<SupplierResponse>> {
    const existingSupplier = await prisma.suppliers.findUnique({
      where: { id },
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
    });

    return {
      statusCode: 200,
      message: "Supplier updated successfully",
      data: this.mapToSupplierResponse(updatedSupplier),
    };
  }

  static async deleteSupplier(id: string): Promise<void> {
    const supplier = await prisma.suppliers.findUnique({
      where: { id },
      include: {
        stockReciepts: true,
        purchaseOrders: true,
        Invoices: true,
      },
    });

    if (!supplier) {
      throw new AppError("Supplier is not found", 404);
    }

    if (
      supplier.stockReciepts.length > 0 ||
      supplier.purchaseOrders.length > 0 ||
      supplier.Invoices.length > 0
    ) {
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
    searchq?: string,
    is_active?: boolean,
    limit?: number,
    currentPage?: number,
  ): Promise<IPaged<SupplierResponse[]>> {
    try {
      const searchOptions = QueryOptions(
        ["supplier_name", "contact_person", "email"],
        searchq,
      );

      const where: any = {
        ...searchOptions,
      };

      if (is_active !== undefined) {
        where.is_active = is_active;
      }

      const pagination = Paginations(currentPage, limit);

      const suppliers = await prisma.suppliers.findMany({
        where,
        ...pagination,
        orderBy: { created_at: "desc" },
      });

      const totalItems = await prisma.suppliers.count({ where });

      const data = suppliers.map((supplier) =>
        this.mapToSupplierResponse(supplier),
      );

      return {
        statusCode: 200,
        message: "Suppliers fetched successfully",
        data,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 15,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  private static mapToSupplierResponse(supplier: any): SupplierResponse {
    return {
      id: supplier.id,
      supplier_name: supplier.supplier_name,
      contact_person: supplier.contact_person,
      phone_number: supplier.phone_number,
      email: supplier.email,
      address: supplier.address,
      is_active: supplier.is_active,
      created_at: supplier.created_at,
    };
  }
}
