import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateStockDto, UpdateStockDto } from "../utils/interfaces/common";
import { StockCalculations } from "../utils/calculations";
import type { Request } from "express";

export class StockService {
  static async createStock(data: CreateStockDto, companyId: string) {
    await this.validateReferences(data, companyId);

    const totalCost = StockCalculations.calculateTotalCost(
      data.quantityReceived,
      data.unitCost,
    );

    const stock = await prisma.stock.create({
      data: { ...data, totalCost, companyId },
      include: { item: true, company: true, supplier: true },
    });

    return {
      message: "Stock record created successfully",
      data: stock,
    };
  }

  static async updateStock(
    id: string,
    data: UpdateStockDto,
    companyId: string,
  ) {
    const existingEntry = await prisma.stock.findUnique({
      where: { id, companyId: companyId },
    });

    if (!existingEntry) {
      throw new AppError("Stock record not found", 404);
    }

    const totalCost =
      data.quantityReceived && data.unitCost
        ? StockCalculations.calculateTotalCost(
            data.quantityReceived,
            data.unitCost,
          )
        : data.quantityReceived
          ? StockCalculations.calculateTotalCost(
              data.quantityReceived,
              parseFloat(existingEntry.unitCost.toString()),
            )
          : data.unitCost
            ? StockCalculations.calculateTotalCost(
                parseFloat(existingEntry.quantityReceived.toString()),
                data.unitCost,
              )
            : parseFloat(existingEntry.totalCost.toString());

    const stock = await prisma.stock.update({
      where: { id },
      data: {
        ...data,
        totalCost: totalCost,
        updatedAt: new Date(),
      },
      include: {
        item: {
          include: {
            category: true,
            company: true,
          },
        },
        supplier: { include: { company: true } },
        company: true,
      },
    });

    return { message: "Stock record updated successfully", data: stock };
  }

  static async deleteStock(id: string, companyId: string) {
    const stock = await prisma.stock.findUnique({
      where: { id, companyId: companyId },
      include: { approvals: true },
    });

    if (!stock) {
      throw new AppError("Stock record not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.approvals.deleteMany({
        where: { stockId: id },
      });
      await tx.stock.delete({
        where: { id },
      });
    });
    return { message: "Stock record deleted successfully" };
  }

  static async getStock(id: string, companyId: string) {
    const stock = await prisma.stock.findUnique({
      where: { id, companyId: companyId },
      include: {
        item: {
          include: {
            category: true,
            company: true,
          },
        },
        supplier: { include: { company: true } },
        company: true,
        approvals: { include: { approvedByUser: true } },
      },
    });

    if (!stock) {
      throw new AppError("Stock record not found", 404);
    }

    return { message: "Stock record retrieved successfully", data: stock };
  }

  static async getAllStock(
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

      const queryOptions = searchq
        ? {
            companyId,
            OR: [
              { purchaseOrderNo: { contains: searchq } },
              { invoiceNo: { contains: searchq } },
              { item: { itemCodeSku: { contains: searchq } } },
              { item: { itemFullName: { contains: searchq } } },
            ],
          }
        : { companyId };

      const skip = page && limit ? (page - 1) * limit : undefined;
      const take = limit;

      const totalItems = await prisma.stock.count({
        where: queryOptions,
      });

      const stock = await prisma.stock.findMany({
        where: queryOptions,
        skip,
        take,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          item: {
            include: {
              category: true,
              company: true,
            },
          },
          supplier: { include: { company: true } },
          company: true,
          approvals: { include: { approvedByUser: true } },
        },
      });

      const stockWithStatus = await Promise.all(
        stock.map(async (stockItem) => {
          const expiryStatus = StockCalculations.calculateDaysToExpiry(
            stockItem.expiryDate ?? undefined,
          );
          const totalStockQuantity = StockCalculations.calculateTotalCost(
            parseFloat(stockItem.quantityReceived.toString()),
            parseFloat(stockItem.unitCost.toString()),
          );
          return {
            ...stockItem,
            expiryStatus,
            totalStockQuantity,
          };
        }),
      );

      return {
        data: stockWithStatus,
        totalItems,
        currentPage: page || 1,
        itemsPerPage: limit || stock.length,
        message: "Stock records retrieved successfully",
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  private static async validateReferences(
    data: CreateStockDto,
    companyId: string,
  ): Promise<void> {
    const item = await prisma.items.findUnique({
      where: { id: data.itemId, companyId: companyId },
    });
    if (!item) {
      throw new AppError("Item not found", 404);
    }

    const supplier = await prisma.suppliers.findUnique({
      where: { id: data.supplierId },
    });
    if (!supplier) {
      throw new AppError("Supplier not found", 404);
    }
  }
}
