import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateStockDto,
  UpdateStockDto,
  CreateManualStockReceiptDto,
} from "../utils/interfaces/common";
import { StockCalculations } from "../utils/calculations";
import type { Request } from "express";
import {
  getItemOrThrow,
  getSupplierOrThrow,
  getWarehouseOrThrow,
} from "../utils/validators";

export class StockService {
  static async createStockReceipt(data: CreateStockDto, companyId: string) {
    const references = await this.validateReferences(data, companyId);

    const totalCost =
      data.quantityReceived * (data.unitCost || references.unitCost);

    const stockReceipt = await prisma.stockReceipts.create({
      data: {
        ...data,
        itemId: references.itemId,
        supplierId: references.supplierId,
        purchaseOrderItemId: data.purchaseOrderItemId,
        totalCost,
        companyId,
      },
      include: {
        item: true,
        company: true,
        supplier: true,
        purchaseOrderItem: {
          include: {
            purchaseOrder: true,
          },
        },
      },
    });

    return {
      message: "Stock record created successfully",
      data: stockReceipt,
    };
  }

  static async createManualStockReceipt(
    data: CreateManualStockReceiptDto,
    companyId: string,
  ) {
    const manualPoNumber = data.manualPoNumber?.trim();
    if (!manualPoNumber) {
      throw new AppError("manualPoNumber is required for manual receipts", 400);
    }

    // Validate item, supplier, warehouse belong to company
    await Promise.all([
      getItemOrThrow(data.itemId, companyId),
      getSupplierOrThrow(data.supplierId, companyId),
      getWarehouseOrThrow(data.warehouseId, companyId),
    ]);

    const quantityReceived = data.quantityReceived;
    const unitCost = data.unitCost;
    const totalCost = quantityReceived * unitCost;

    const stockReceipt = await prisma.stockReceipts.create({
      data: {
        itemId: data.itemId,
        supplierId: data.supplierId,
        purchaseOrderId: null,
        purchaseOrderItemId: null,
        manualPoNumber: manualPoNumber,
        dateReceived: new Date(data.dateReceived),
        quantityReceived,
        unitCost,
        totalCost,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        invoiceNo: data.invoiceNo,
        warehouseId: data.warehouseId,
        condition: data.condition,
        tempReq: data.tempReq,
        uom: data.uom,
        currency: data.currency,
        packSize: data.packSize,
        companyId,
        receiptType: "MANUAL",
        remarksNotes: data.remarksNotes,
        specialHandlingNotes: data.specialHandlingNotes,
      },
      include: {
        item: true,
        supplier: true,
        company: true,
        warehouse: true,
      },
    });

    return {
      message: "Manual stock receipt created successfully",
      data: stockReceipt,
    };
  }

  static async addToStock(stockReceiptId: string) {
    return await prisma.$transaction(async (tx) => {
      const stockReceipt = await tx.stockReceipts.findUnique({
        where: { id: stockReceiptId },
        include: {
          item: true,
          approvals: {
            where: { approvalStatus: "APPROVED" },
            orderBy: { dateApproved: "desc" },
            take: 1,
          },
        },
      });

      if (!stockReceipt) {
        throw new AppError("Stock receipt not found", 404);
      }

      const expectedSellPrice =
        stockReceipt.approvals[0]?.ExpectedSellPrice || null;

      const existingStock = await tx.stock.findFirst({
        where: {
          stockReceipt: { itemId: stockReceipt.itemId },
          status: "AVAILABLE",
        },
        include: {
          stockReceipt: {
            include: {
              approvals: {
                where: { approvalStatus: "APPROVED" },
                orderBy: { dateApproved: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      if (existingStock) {
        const newStockUnits = Array.from(
          {
            length: stockReceipt.quantityReceived.toNumber(),
          },
          () => ({
            stockReceiptId: stockReceiptId,
            status: "AVAILABLE",
          }),
        );

        await tx.stock.createMany({
          data: newStockUnits,
        });

        const allStockReceiptsForItem = await tx.stockReceipts.findMany({
          where: { itemId: stockReceipt.itemId },
          select: { id: true },
        });

        const stockReceiptIds = allStockReceiptsForItem.map((sr) => sr.id);

        if (expectedSellPrice) {
          await tx.approvals.updateMany({
            where: {
              stockReceiptId: { in: stockReceiptIds },
              approvalStatus: "APPROVED",
            },
            data: {
              ExpectedSellPrice: expectedSellPrice,
            },
          });
        }

        return {
          message:
            "Stock updated successfully - quantity added and sell price updated",
          stockUnitsCreated: newStockUnits.length,
          totalAvailableUnits: await tx.stock.count({
            where: {
              stockReceipt: { itemId: stockReceipt.itemId },
              status: "AVAILABLE",
            },
          }),
        };
      } else {
        const stockUnits = Array.from(
          { length: stockReceipt.quantityReceived.toNumber() },
          () => ({
            stockReceiptId: stockReceiptId,
            status: "AVAILABLE",
          }),
        );

        await tx.stock.createMany({
          data: stockUnits,
        });

        return {
          message: "New stock item created successfully",
          stockUnitsCreated: stockUnits.length,
          totalAvailableUnits: stockUnits.length,
        };
      }
    });
  }

  static async updateStockReceipt(
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
        await getItemOrThrow(String(data.itemId), companyId);
      }

      if (data.supplierId) {
        await getSupplierOrThrow(String(data.supplierId), companyId);
      }

      const totalCost = StockCalculations.calculateTotalCost(
        data.quantityReceived ??
          parseFloat(existingEntry.quantityReceived.toString()),
        data.unitCost ?? parseFloat(existingEntry.unitCost.toString()),
      );

      let stockAdjustment: Array<{
        stockReceiptId: string;
        status: "AVAILABLE";
      }> = [];

      if (data.quantityReceived !== undefined) {
        const newQty = data.quantityReceived;
        const oldQty = parseFloat(existingEntry.quantityReceived.toString());
        const diff = newQty - oldQty;

        if (diff > 0) {
          stockAdjustment = Array.from({ length: diff }, () => ({
            stockReceiptId: id,
            status: "AVAILABLE",
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

  static async deleteStockReceipt(id: string, companyId: string) {
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

  static async getStockReceipt(id: string, companyId: string) {
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
        stocks: { where: { status: "AVAILABLE" } },
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
              { invoiceNo: { contains: searchq } },
              { item: { itemCodeSku: { contains: searchq } } },
              { item: { itemFullName: { contains: searchq } } },
              {
                purchaseOrderItem: {
                  purchaseOrder: {
                    poNumber: { contains: searchq },
                  },
                },
              },
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
          item: { include: { category: true, company: true } },
          supplier: { include: { company: true } },
          warehouse: true,
          company: true,
          approvals: { include: { approvedByUser: true } },
          stocks: { where: { status: "AVAILABLE" } },
          purchaseOrderItem: {
            include: { purchaseOrder: true },
          },
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
            isApproved: stockItem.approvals.some(
              (a) => a.approvalStatus === "APPROVED",
            ),
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
  ): Promise<{
    itemId: string;
    supplierId: string;
    unitCost: number;
  }> {
    if (data.itemId) {
      const item = await prisma.items.findUnique({
        where: { id: data.itemId, companyId },
      });
      if (!item) throw new AppError("Item not found", 404);
    }

    if (data.supplierId) {
      const supplier = await prisma.suppliers.findUnique({
        where: { id: data.supplierId, companyId },
      });
      if (!supplier) throw new AppError("Supplier not found", 404);
    }

    if (data.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({
        where: { id: data.purchaseOrderId },
        include: { stockReceipts: { select: { quantityReceived: true } } },
      });
      if (!po) throw new AppError("Purchase Order not found", 404);
    }

    const poItem = await prisma.purchaseOrderItem.findUnique({
      where: { id: data.purchaseOrderItemId },
      include: {
        purchaseOrder: true,
        item: true,
        stockReceipts: true,
      },
    });

    if (!poItem || poItem.purchaseOrder.companyId !== companyId) {
      throw new AppError("Invalid purchase order item", 400);
    }

    const received = poItem.stockReceipts.reduce(
      (sum, sr) => sum + sr.quantityReceived.toNumber(),
      0,
    );
    const remaining = poItem.quantity.toNumber() - received;

    if (data.quantityReceived > remaining) {
      throw new AppError(`Quantity exceeds PO remaining (${remaining})`, 400);
    }

    return {
      itemId: poItem.itemId,
      supplierId: poItem.purchaseOrder.supplierId,
      unitCost: data.unitCost || 0,
    };
  }
}
