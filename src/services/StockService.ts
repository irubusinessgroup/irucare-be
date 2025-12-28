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
import { EbmService } from "./EbmService";

export class StockService {
  static async createStockReceipt(
    data: CreateStockDto,
    companyId: string,
    branchId?: string | null,
  ) {
    const references = await this.validateReferences(data, companyId, branchId);

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
        branchId,
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
    branchId?: string | null,
  ) {
    const manualPoNumber = data.manualPoNumber?.trim();
    if (!manualPoNumber) {
      throw new AppError("manualPoNumber is required for manual receipts", 400);
    }

    // Validate item, supplier, warehouse belong to company
    await Promise.all([
      getItemOrThrow(data.itemId, companyId, branchId),
      getSupplierOrThrow(data.supplierId, companyId, branchId),
      getWarehouseOrThrow(data.warehouseId, companyId, branchId),
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
        branchId,
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

  static async addToStock(
    stockReceiptId: string,
    tx?: any,
    userId?: string
  ) {
    const client = tx || prisma;

    const stockReceipt = await client.stockReceipts.findUnique({
      where: { id: stockReceiptId },
      include: {
        item: true,
        company: true,
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

    // --- EBM Registration ---
    if (!stockReceipt.ebmSynced) {
      const company = stockReceipt.company;
      let user = null;

      if (userId) {
        user = await client.user.findUnique({
          where: { id: userId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }

      if (!user) {
        // Fallback to finding a COMPANY_ADMIN if userId not provided or not found
        user = await client.user.findFirst({
          where: {
            company: { companyId: stockReceipt.companyId },
            userRoles: { some: { name: "COMPANY_ADMIN" } },
          },
          select: { id: true, firstName: true, lastName: true, email: true },
        });
      }

      if (company && user) {
        const ebmResponse = await EbmService.saveStockToEBM(
          stockReceipt,
          company,
          user,
          stockReceipt.branchId
        );

        if (ebmResponse.resultCd !== "000") {
          throw new AppError(
            `EBM Stock Registration Failed: ${ebmResponse.resultMsg}`,
            400
          );
        }

        // Mark as synced
        await client.stockReceipts.update({
          where: { id: stockReceiptId },
          data: { ebmSynced: true },
        });
      }
    }

    const expectedSellPrice = stockReceipt.approvals[0]?.ExpectedSellPrice || null;

    const existingStock = await client.stock.findFirst({
      where: {
        stockReceipt: {
          itemId: stockReceipt.itemId,
          branchId: stockReceipt.branchId,
        },
        status: "AVAILABLE",
      },
    });

    if (existingStock) {
      const newStockUnits = Array.from(
        {
          length: Number(stockReceipt.quantityReceived),
        },
        () => ({
          stockReceiptId: stockReceiptId,
          status: "AVAILABLE",
          quantity: 1,
          quantityAvailable: 1,
          companyId: stockReceipt.companyId,
          branchId: stockReceipt.branchId,
        })
      );

      await client.stock.createMany({
        data: newStockUnits,
      });

      const allStockReceiptsForItem = await client.stockReceipts.findMany({
        where: { itemId: stockReceipt.itemId },
        select: { id: true },
      });

      const stockReceiptIds = allStockReceiptsForItem.map((sr: any) => sr.id);

      if (expectedSellPrice) {
        await client.approvals.updateMany({
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
        message: "Stock updated successfully - quantity added and sell price updated",
        stockUnitsCreated: newStockUnits.length,
      };
    } else {
      const stockUnits = Array.from(
        { length: Number(stockReceipt.quantityReceived) },
        () => ({
          stockReceiptId: stockReceiptId,
          status: "AVAILABLE",
          quantity: 1,
          quantityAvailable: 1,
          companyId: stockReceipt.companyId,
          branchId: stockReceipt.branchId,
        })
      );

      await client.stock.createMany({
        data: stockUnits,
      });

      return {
        message: "New stock item created successfully",
        stockUnitsCreated: stockUnits.length,
      };
    }
  }

  static async updateStockReceipt(
    id: string,
    data: UpdateStockDto,
    companyId: string,
    branchId?: string | null,
  ) {
    return await prisma.$transaction(async (tx) => {
      const where: any = { id, companyId };
      if (branchId) {
        where.branchId = branchId;
      }
      const existingEntry = await tx.stockReceipts.findUnique({
        where,
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
        await getItemOrThrow(String(data.itemId), companyId, branchId);
      }

      if (data.supplierId) {
        await getSupplierOrThrow(String(data.supplierId), companyId, branchId);
      }

      const totalCost = StockCalculations.calculateTotalCost(
        data.quantityReceived ??
          parseFloat(existingEntry.quantityReceived.toString()),
        data.unitCost ?? parseFloat(existingEntry.unitCost.toString()),
      );

      let stockAdjustment: Array<{
        stockReceiptId: string;
        status: "AVAILABLE";
        quantity: 1;
        quantityAvailable: 1;
      }> = [];

      if (data.quantityReceived !== undefined) {
        const newQty = data.quantityReceived;
        const oldQty = parseFloat(existingEntry.quantityReceived.toString());
        const diff = newQty - oldQty;

        if (diff > 0) {
          stockAdjustment = Array.from({ length: diff }, () => ({
            stockReceiptId: id,
            status: "AVAILABLE",
            quantity: 1,
            quantityAvailable: 1,
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

  static async deleteStockReceipt(
    id: string,
    companyId: string,
    branchId?: string | null,
  ) {
    const where: any = { id, companyId: companyId };
    if (branchId) {
      where.branchId = branchId;
    }
    const stock = await prisma.stockReceipts.findUnique({
      where,
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

  static async getStockReceipt(
    id: string,
    companyId: string,
    branchId?: string | null,
  ) {
    const where: any = { id, companyId: companyId };
    if (branchId) {
      where.branchId = branchId;
    }
    const stock = await prisma.stockReceipts.findUnique({
      where,
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
    branchId?: string | null,
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
        : {};

      const where: any = {
        ...queryOptions,
        companyId,
      };

      if (branchId) {
        where.branchId = branchId;
      }

      const skip = page && limit ? (page - 1) * limit : undefined;
      const take = limit;

      const totalItems = await prisma.stockReceipts.count({
        where,
      });

      const stock = await prisma.stockReceipts.findMany({
        where,
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
    branchId?: string | null,
  ): Promise<{
    itemId: string;
    supplierId: string;
    unitCost: number;
  }> {
    if (data.itemId) {
      const item = await prisma.items.findUnique({
        where: { id: data.itemId, companyId, ...(branchId ? { branchId } : {}) },
      });
      if (!item) throw new AppError("Item not found", 404);
    }

    if (data.supplierId) {
      const supplier = await prisma.suppliers.findUnique({
        where: { id: data.supplierId, companyId, ...(branchId ? { branchId } : {}) },
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
