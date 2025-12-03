import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { assertCompanyExists } from "../utils/validators";

interface IssueStockDto {
  itemId: string;
  quantity: number;
  issuedTo: string; // Department/Ward/Pharmacy name
  issuedToType: "PHARMACY" | "WARD" | "DEPARTMENT" | "OTHER";
  recipientName: string;
  recipientId?: string; // Optional: link to staff/user
  purpose: string;
  notes?: string;
  warehouseId: string;
  requestedBy?: string;
}

interface TransferStockDto {
  itemId: string;
  quantity: number;
  fromWarehouseId: string;
  toWarehouseId: string;
  reason: string;
  notes?: string;
  requestedBy?: string;
}

interface StockAdjustmentDto {
  itemId: string;
  warehouseId: string;
  adjustmentType: "ADD" | "SUBTRACT" | "SET";
  quantity: number;
  reason: string;
  notes?: string;
}

export class StockIssuanceService {
  /**
   * Issue stock to departments/wards/pharmacy
   */
  public static async issueStock(req: Request, data: IssueStockDto) {
    const companyId = req.user?.company?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    await assertCompanyExists(companyId);

    // Validate item exists
    const item = await prisma.items.findFirst({
      where: { id: data.itemId, companyId },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    // Validate warehouse
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: data.warehouseId, companyId },
    });

    if (!warehouse) {
      throw new AppError("Warehouse not found", 404);
    }

    return await prisma.$transaction(async (tx) => {
      // Find available stock units (FIFO - First In First Out)
      const availableStock = await tx.stock.findMany({
        where: {
          stockReceipt: {
            itemId: data.itemId,
            warehouseId: data.warehouseId,
            companyId,
          },
          status: "AVAILABLE",
          quantityAvailable: { gt: 0 },
        },
        include: {
          stockReceipt: true,
        },
        orderBy: {
          stockReceipt: { dateReceived: "asc" },
        },
      });

      // Calculate total available
      const totalAvailable = availableStock.reduce(
        (sum, stock) => sum + Number(stock.quantityAvailable),
        0,
      );

      if (totalAvailable < data.quantity) {
        throw new AppError(
          `Insufficient stock. Available: ${totalAvailable}, Requested: ${data.quantity}`,
          400,
        );
      }

      // Create stock issuance record
      const issuance = await tx.stockIssuance.create({
        data: {
          itemId: data.itemId,
          companyId,
          warehouseId: data.warehouseId,
          quantity: data.quantity,
          issuedTo: data.issuedTo,
          issuedToType: data.issuedToType,
          recipientName: data.recipientName,
          recipientId: data.recipientId,
          purpose: data.purpose,
          notes: data.notes,
          issuedBy: userId,
          requestedBy: data.requestedBy,
          issuedAt: new Date(),
          status: "COMPLETED",
        },
      });

      // Deduct stock using FIFO
      let remainingToIssue = data.quantity;
      const stockUpdatePromises = [];

      for (const stock of availableStock) {
        if (remainingToIssue <= 0) break;

        const availableInThisStock = Number(stock.quantityAvailable);
        const toDeduct = Math.min(remainingToIssue, availableInThisStock);

        stockUpdatePromises.push(
          tx.stock.update({
            where: { id: stock.id },
            data: {
              quantityAvailable: Number(stock.quantityAvailable) - toDeduct,
              status:
                Number(stock.quantityAvailable) - toDeduct === 0
                  ? "ISSUED"
                  : "AVAILABLE",
            },
          }),
        );

        // Create issuance detail record
        stockUpdatePromises.push(
          tx.stockIssuanceDetail.create({
            data: {
              issuanceId: issuance.id,
              stockId: stock.id,
              quantityIssued: toDeduct,
            },
          }),
        );

        remainingToIssue -= toDeduct;
      }

      await Promise.all(stockUpdatePromises);

      // Create stock movement record
      await tx.stockMovement.create({
        data: {
          itemId: data.itemId,
          companyId,
          movementType: "ISSUE",
          quantity: data.quantity,
          fromWarehouseId: data.warehouseId,
          toLocation: data.issuedTo,
          reason: data.purpose,
          notes: data.notes,
          performedBy: userId,
          referenceId: issuance.id,
          referenceType: "ISSUANCE",
        },
      });

      return {
        message: "Stock issued successfully",
        data: issuance,
      };
    });
  }

  /**
   * Transfer stock between warehouses
   */
  public static async transferStock(req: Request, data: TransferStockDto) {
    const companyId = req.user?.company?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new AppError("Cannot transfer to the same warehouse", 400);
    }

    // Validate warehouses
    const [fromWarehouse, toWarehouse] = await Promise.all([
      prisma.warehouse.findFirst({
        where: { id: data.fromWarehouseId, companyId },
      }),
      prisma.warehouse.findFirst({
        where: { id: data.toWarehouseId, companyId },
      }),
    ]);

    if (!fromWarehouse || !toWarehouse) {
      throw new AppError("One or both warehouses not found", 404);
    }

    return await prisma.$transaction(async (tx) => {
      // Find available stock in source warehouse
      const availableStock = await tx.stock.findMany({
        where: {
          stockReceipt: {
            itemId: data.itemId,
            warehouseId: data.fromWarehouseId,
            companyId,
          },
          status: "AVAILABLE",
          quantityAvailable: { gt: 0 },
        },
        include: { stockReceipt: true },
        orderBy: {
          stockReceipt: { dateReceived: "asc" }, // FIFO
        },
      });

      const totalAvailable = availableStock.reduce(
        (sum, stock) => sum + Number(stock.quantityAvailable),
        0,
      );

      if (totalAvailable < data.quantity) {
        throw new AppError(
          `Insufficient stock in source warehouse. Available: ${totalAvailable}`,
          400,
        );
      }

      // Create transfer record
      const transfer = await tx.stockTransfer.create({
        data: {
          itemId: data.itemId,
          companyId,
          fromWarehouseId: data.fromWarehouseId,
          toWarehouseId: data.toWarehouseId,
          quantity: data.quantity,
          reason: data.reason,
          notes: data.notes,
          requestedBy: data.requestedBy,
          transferredBy: userId,
          transferredAt: new Date(),
          status: "COMPLETED",
        },
      });

      // Deduct from source warehouse and create receipt in destination
      let remainingToTransfer = data.quantity;
      const updatePromises = [];

      for (const stock of availableStock) {
        if (remainingToTransfer <= 0) break;

        const availableInThisStock = Number(stock.quantityAvailable);
        const toTransfer = Math.min(remainingToTransfer, availableInThisStock);

        // Update source stock
        updatePromises.push(
          tx.stock.update({
            where: { id: stock.id },
            data: {
              quantityAvailable: availableInThisStock - toTransfer,
              status:
                availableInThisStock - toTransfer === 0
                  ? "TRANSFERRED"
                  : "AVAILABLE",
            },
          }),
        );

        // Create new stock receipt in destination warehouse
        const newReceipt = await tx.stockReceipts.create({
          data: {
            itemId: data.itemId,
            companyId,
            supplierId: stock.stockReceipt.supplierId,
            dateReceived: new Date(),
            expiryDate: stock.stockReceipt.expiryDate,
            quantityReceived: toTransfer,
            unitCost: stock.stockReceipt.unitCost,
            totalCost: Number(stock.stockReceipt.unitCost) * toTransfer,
            packSize: stock.stockReceipt.packSize,
            uom: stock.stockReceipt.uom,
            tempReq: stock.stockReceipt.tempReq,
            currency: stock.stockReceipt.currency,
            condition: stock.stockReceipt.condition,
            warehouseId: data.toWarehouseId,
            receiptType: "TRANSFER",
            remarksNotes: `Transfer from ${fromWarehouse.warehousename}: ${data.reason}`,
          },
        });

        // Create stock units in destination
        updatePromises.push(
          tx.stock.create({
            data: {
              stockReceiptId: newReceipt.id,
              status: "AVAILABLE",
              quantity: toTransfer,
              quantityAvailable: toTransfer,
            },
          }),
        );

        remainingToTransfer -= toTransfer;
      }

      await Promise.all(updatePromises);

      // Create movement records
      await Promise.all([
        tx.stockMovement.create({
          data: {
            itemId: data.itemId,
            companyId,
            movementType: "TRANSFER_OUT",
            quantity: data.quantity,
            fromWarehouseId: data.fromWarehouseId,
            toWarehouseId: data.toWarehouseId,
            reason: data.reason,
            notes: data.notes,
            performedBy: userId,
            referenceId: transfer.id,
            referenceType: "TRANSFER",
          },
        }),
        tx.stockMovement.create({
          data: {
            itemId: data.itemId,
            companyId,
            movementType: "TRANSFER_IN",
            quantity: data.quantity,
            fromWarehouseId: data.fromWarehouseId,
            toWarehouseId: data.toWarehouseId,
            reason: data.reason,
            notes: data.notes,
            performedBy: userId,
            referenceId: transfer.id,
            referenceType: "TRANSFER",
          },
        }),
      ]);

      return {
        message: "Stock transferred successfully",
        data: transfer,
      };
    });
  }

  /**
   * Adjust stock (for corrections, damages, etc.)
   */
  public static async adjustStock(req: Request, data: StockAdjustmentDto) {
    const companyId = req.user?.company?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    return await prisma.$transaction(async (tx) => {
      const adjustment = await tx.stockAdjustment.create({
        data: {
          itemId: data.itemId,
          companyId,
          warehouseId: data.warehouseId,
          adjustmentType: data.adjustmentType,
          quantity: data.quantity,
          reason: data.reason,
          notes: data.notes,
          adjustedBy: userId,
          adjustedAt: new Date(),
        },
      });

      if (data.adjustmentType === "ADD") {
        // Create a new stock receipt for additions
        const receipt = await tx.stockReceipts.create({
          data: {
            itemId: data.itemId,
            companyId,
            dateReceived: new Date(),
            quantityReceived: data.quantity,
            unitCost: 0, // Adjustment, no cost
            totalCost: 0,
            uom: "UNIT",
            tempReq: "AMBIENT",
            currency: "RWF",
            condition: "NEW",
            warehouseId: data.warehouseId,
            receiptType: "ADJUSTMENT",
            remarksNotes: `Adjustment: ${data.reason}`,
          },
        });

        await tx.stock.create({
          data: {
            stockReceiptId: receipt.id,
            status: "AVAILABLE",
            quantity: data.quantity,
            quantityAvailable: data.quantity,
          },
        });
      } else {
        // For SUBTRACT or SET, update existing stock
        const availableStock = await tx.stock.findMany({
          where: {
            stockReceipt: {
              itemId: data.itemId,
              warehouseId: data.warehouseId,
              companyId,
            },
            status: "AVAILABLE",
            quantityAvailable: { gt: 0 },
          },
          orderBy: {
            stockReceipt: { dateReceived: "asc" },
          },
        });

        let toDeduct = data.quantity;
        for (const stock of availableStock) {
          if (toDeduct <= 0) break;

          const available = Number(stock.quantityAvailable);
          const deduct = Math.min(toDeduct, available);

          await tx.stock.update({
            where: { id: stock.id },
            data: {
              quantityAvailable: available - deduct,
              status: available - deduct === 0 ? "ADJUSTED" : "AVAILABLE",
            },
          });

          toDeduct -= deduct;
        }
      }

      // Create movement record
      await tx.stockMovement.create({
        data: {
          itemId: data.itemId,
          companyId,
          movementType: "ADJUSTMENT",
          quantity: data.quantity,
          fromWarehouseId: data.warehouseId,
          reason: data.reason,
          notes: data.notes,
          performedBy: userId,
          referenceId: adjustment.id,
          referenceType: "ADJUSTMENT",
        },
      });

      return {
        message: "Stock adjusted successfully",
        data: adjustment,
      };
    });
  }

  /**
   * Get stock movement history
   */
  public static async getStockMovements(
    req: Request,
    filters?: {
      itemId?: string;
      warehouseId?: string;
      movementType?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const where: any = { companyId };

    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.movementType) where.movementType = filters.movementType;
    if (filters?.warehouseId) {
      where.OR = [
        { fromWarehouseId: filters.warehouseId },
        { toWarehouseId: filters.warehouseId },
      ];
    }
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const skip = page && limit ? (page - 1) * limit : 0;

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          item: {
            select: {
              id: true,
              itemFullName: true,
              itemCodeSku: true,
            },
          },
          fromWarehouse: {
            select: { id: true, warehousename: true },
          },
          toWarehouse: {
            select: { id: true, warehousename: true },
          },
          performedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return {
      data: movements,
      totalItems: total,
      currentPage: page || 1,
      itemsPerPage: limit || movements.length,
      message: "Stock movements retrieved successfully",
    };
  }

  /**
   * Get issuance history
   */
  public static async getIssuanceHistory(
    req: Request,
    filters?: {
      itemId?: string;
      warehouseId?: string;
      issuedToType?: string;
      startDate?: Date;
      endDate?: Date;
    },
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const where: any = { companyId };

    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.issuedToType) where.issuedToType = filters.issuedToType;
    if (filters?.startDate || filters?.endDate) {
      where.issuedAt = {};
      if (filters.startDate) where.issuedAt.gte = filters.startDate;
      if (filters.endDate) where.issuedAt.lte = filters.endDate;
    }

    const skip = page && limit ? (page - 1) * limit : 0;

    const [issuances, total] = await Promise.all([
      prisma.stockIssuance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issuedAt: "desc" },
        include: {
          item: {
            select: {
              id: true,
              itemFullName: true,
              itemCodeSku: true,
            },
          },
          warehouse: {
            select: { id: true, warehousename: true },
          },
          issuedByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          details: {
            include: {
              stock: {
                include: {
                  stockReceipt: {
                    select: {
                      dateReceived: true,
                      expiryDate: true,
                      unitCost: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.stockIssuance.count({ where }),
    ]);

    return {
      data: issuances,
      totalItems: total,
      currentPage: page || 1,
      itemsPerPage: limit || issuances.length,
      message: "Issuance history retrieved successfully",
    };
  }
}
