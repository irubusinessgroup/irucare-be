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

    const stock = await prisma.stockReceipts.create({
      data: { ...data, totalCost, companyId },
      include: { item: true, company: true, supplier: true },
    });

    const stockToCreate = Array.from({ length: data.quantityReceived }, () => ({
      stockReceiptId: stock.id,
      status: "AVAILABLE",
      sellId: null,
    }));

    await prisma.stock.createMany({
      data: stockToCreate,
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
    return await prisma.$transaction(async (tx) => {
      const existingEntry = await tx.stockReceipts.findUnique({
        where: { id, companyId },
        include: {
          stocks: {
            where: { status: "AVAILABLE" },
            select: { id: true },
          },
        },
      });

      if (!existingEntry) {
        throw new AppError("Stock record not found", 404);
      }

      if (data.itemId) {
        const item = await tx.items.findUnique({
          where: { id: data.itemId, companyId },
        });
        if (!item) {
          throw new AppError(
            "Item not found or doesn't belong to your company",
            404,
          );
        }
      }

      if (data.supplierId) {
        const supplier = await tx.suppliers.findUnique({
          where: { id: data.supplierId, companyId },
        });
        if (!supplier) {
          throw new AppError(
            "Supplier not found or doesn't belong to your company",
            404,
          );
        }
      }

      const totalCost = StockCalculations.calculateTotalCost(
        data.quantityReceived ??
          parseFloat(existingEntry.quantityReceived.toString()),
        data.unitCost ?? parseFloat(existingEntry.unitCost.toString()),
      );

      type StockAdjustment = {
        stockReceiptId: string;
        status: "AVAILABLE";
        // companyId: string;
      };

      let stockAdjustment: StockAdjustment[] = [];

      if (data.quantityReceived !== undefined) {
        const newQty = data.quantityReceived;
        const oldQty = parseFloat(existingEntry.quantityReceived.toString());
        const diff = newQty - oldQty;

        if (diff > 0) {
          stockAdjustment = Array.from({ length: diff }, () => ({
            stockReceiptId: id,
            status: "AVAILABLE",
            // companyId,
          }));
        } else if (diff < 0) {
          const decreaseBy = -diff;
          const availableCount = existingEntry.stocks.length;

          if (availableCount < decreaseBy) {
            throw new AppError(
              `Cannot reduce quantity by ${decreaseBy}. Only ${availableCount} available units exist.`,
              400,
            );
          }

          const stockIdsToDelete = existingEntry.stocks
            .slice(0, decreaseBy)
            .map((stock) => stock.id);

          await tx.stock.deleteMany({
            where: { id: { in: stockIdsToDelete } },
          });
        }
      }

      const updatedReceipt = await tx.stockReceipts.update({
        where: { id },
        data: {
          ...data,
          totalCost,
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

      if (stockAdjustment.length > 0) {
        await tx.stock.createMany({
          data: stockAdjustment,
        });
      }

      return {
        message: "Stock record updated successfully",
        data: updatedReceipt,
      };
    });
  }

  static async deleteStock(id: string, companyId: string) {
    const stock = await prisma.stockReceipts.findUnique({
      where: { id, companyId: companyId },
      include: { approvals: true },
    });

    if (!stock) {
      throw new AppError("Stock record not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.approvals.deleteMany({
        where: { stockReceiptId: id },
      });
      await tx.stockReceipts.delete({
        where: { id },
      });
    });
    return { message: "Stock record deleted successfully" };
  }

  static async getStock(id: string, companyId: string) {
    const stock = await prisma.stockReceipts.findUnique({
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
              { purchaseOrderId: { contains: searchq } },
              { invoiceNo: { contains: searchq } },
              { item: { itemCodeSku: { contains: searchq } } },
              { item: { itemFullName: { contains: searchq } } },
            ],
          }
        : { companyId };

      const skip = page && limit ? (page - 1) * limit : undefined;
      const take = limit;

      const totalItems = await prisma.stockReceipts.count({
        where: queryOptions,
      });

      const stock = await prisma.stockReceipts.findMany({
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

    if (data.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: data.purchaseOrderId },
      });
      if (!po) throw new AppError("Purchase Order not found", 404);
    }
  }
}
