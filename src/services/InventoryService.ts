import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { assertCompanyExists } from "../utils/validators";

export class InventoryService {
  public static async getInventory(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }
    await assertCompanyExists(companyId);

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
            // { brandManufacturer: { contains: searchq } },
          ],
        }
      : {};

    const items = await prisma.items.findMany({
      where: {
        companyId,
        stockReceipts: {
          some: {
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
            ],
          },
        },
        ...searchCondition,
      },
      include: {
        category: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        stockReceipts: {
          where: {
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
            ],
          },
          include: {
            supplier: {
              select: {
                id: true,
                supplierName: true,
              },
            },
            warehouse: true,
            stocks: {
              where: {
                status: { in: ["AVAILABLE", "RESERVED", "IN_TRANSIT"] },
              },
              select: {
                id: true,
                status: true,
              },
            },
            approvals: {
              where: { approvalStatus: "APPROVED" },
              orderBy: { dateApproved: "desc" },
              take: 1,
              select: {
                ExpectedSellPrice: true,
                dateApproved: true,
                approvedByUser: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const inventoryData = items.map((item) => {
      const totalCurrentStock = item.stockReceipts.reduce((total, receipt) => {
        return total + receipt.stocks.length;
      }, 0);

      const latestReceipt = item.stockReceipts.reduce((latest, current) => {
        return new Date(current.dateReceived) > new Date(latest.dateReceived)
          ? current
          : latest;
      }, item.stockReceipts[0]);

      let latestExpectedSellPrice = null;
      let latestApprovalDate: Date | null = null;
      let latestApprovedBy = null;

      item.stockReceipts.forEach((receipt) => {
        if (receipt.approvals[0]) {
          const approval = receipt.approvals[0];
          if (
            !latestApprovalDate ||
            new Date(approval.dateApproved) > new Date(latestApprovalDate)
          ) {
            latestExpectedSellPrice = approval.ExpectedSellPrice;
            latestApprovalDate = approval.dateApproved;
            latestApprovedBy = `${approval.approvedByUser.firstName} ${approval.approvedByUser.lastName}`;
          }
        }
      });

      const totalQuantityReceived = item.stockReceipts.reduce(
        (total, receipt) => {
          return total + Number(receipt.quantityReceived);
        },
        0
      );

      let totalCost = 0;
      let totalQuantityForCost = 0;
      item.stockReceipts.forEach((receipt) => {
        totalCost += Number(receipt.totalCost);
        totalQuantityForCost += Number(receipt.quantityReceived);
      });
      const avgUnitCost =
        totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;

      const minLevel = Number(item.minLevel);
      const maxLevel = Number(item.maxLevel);
      let stockStatus = "NORMAL";
      if (totalCurrentStock <= minLevel) {
        stockStatus = "LOW_STOCK";
      } else if (totalCurrentStock >= maxLevel) {
        stockStatus = "OVER_STOCK";
      }

      const suppliers = [
        ...new Set(item.stockReceipts.map((r) => r.supplier?.supplierName)),
      ];

      const earliestExpiry = item.stockReceipts.reduce(
        (earliest, receipt) => {
          if (!receipt.expiryDate) return earliest;
          if (!earliest) return receipt.expiryDate;
          return new Date(receipt.expiryDate) < new Date(earliest)
            ? receipt.expiryDate
            : earliest;
        },
        null as Date | null
      );

      return {
        itemId: item.id,
        itemCodeSku: item.itemCodeSku,
        productCode: item.productCode,
        itemFullName: item.itemFullName,
        category: item.category,
        suppliers: suppliers,
        primarySupplier: latestReceipt.supplier?.supplierName,
        dateReceived: latestReceipt.dateReceived,
        expiryDate: earliestExpiry,
        totalQuantityReceived: totalQuantityReceived,
        currentStock: totalCurrentStock,
        avgUnitCost: avgUnitCost,
        totalValue: totalCurrentStock * avgUnitCost,
        currency: latestReceipt.currency,
        warehouse: latestReceipt.warehouse,
        condition: latestReceipt.condition,
        stockStatus,
        minLevel: item.minLevel,
        maxLevel: item.maxLevel,
        expectedSellPrice: latestExpectedSellPrice,
        tempReq: latestReceipt.tempReq,
        uom: latestReceipt.uom,
        packSize: latestReceipt.packSize,
        approvedBy: latestApprovedBy,
        dateApproved: latestApprovalDate,
        totalReceipts: item.stockReceipts.length,
      };
    });

    const skip = page && limit ? (page - 1) * limit : 0;
    const paginatedData = limit
      ? inventoryData.slice(skip, skip + limit)
      : inventoryData;

    return {
      data: paginatedData,
      totalItems: inventoryData.length,
      currentPage: page || 1,
      itemsPerPage: limit || inventoryData.length,
      message: "Inventory retrieved successfully",
    };
  }

  public static async getExpiringItems(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }
    await assertCompanyExists(companyId);

    const now = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
            // { brandManufacturer: { contains: searchq } },
          ],
        }
      : {};

    const items = await prisma.items.findMany({
      where: {
        companyId,
        stockReceipts: {
          some: {
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
            ],
            expiryDate: {
              not: null,
              gt: now,
              lte: threeMonthsFromNow,
            },
          },
        },
        ...searchCondition,
      },
      include: {
        category: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        stockReceipts: {
          where: {
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
            ],
            expiryDate: {
              not: null,
              gt: now,
              lte: threeMonthsFromNow,
            },
          },
          include: {
            supplier: {
              select: {
                id: true,
                supplierName: true,
              },
            },
            warehouse: true,
            stocks: {
              where: {
                status: { in: ["AVAILABLE", "RESERVED", "IN_TRANSIT"] },
              },
              select: {
                id: true,
                status: true,
              },
            },
            approvals: {
              where: { approvalStatus: "APPROVED" },
              orderBy: { dateApproved: "desc" },
              take: 1,
              select: {
                ExpectedSellPrice: true,
                dateApproved: true,
                approvedByUser: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { expiryDate: "asc" },
        },
      },
    });

    const expiringData = items.map((item) => {
      const earliestExpiringReceipt = item.stockReceipts[0];

      const expiryDate = new Date(earliestExpiringReceipt.expiryDate!);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      let urgencyLevel = "LOW";
      if (daysUntilExpiry <= 7) {
        urgencyLevel = "CRITICAL";
      } else if (daysUntilExpiry <= 30) {
        urgencyLevel = "HIGH";
      } else if (daysUntilExpiry <= 60) {
        urgencyLevel = "MEDIUM";
      }

      const totalCurrentStock = item.stockReceipts.reduce((total, receipt) => {
        return total + receipt.stocks.length;
      }, 0);

      let latestExpectedSellPrice = null;
      let latestApprovalDate: Date | null = null;
      let latestApprovedBy = null;

      item.stockReceipts.forEach((receipt) => {
        if (receipt.approvals[0]) {
          const approval = receipt.approvals[0];
          if (
            !latestApprovalDate ||
            new Date(approval.dateApproved) > new Date(latestApprovalDate)
          ) {
            latestExpectedSellPrice = approval.ExpectedSellPrice;
            latestApprovalDate = approval.dateApproved;
            latestApprovedBy = `${approval.approvedByUser.firstName} ${approval.approvedByUser.lastName}`;
          }
        }
      });

      const totalQuantityReceived = item.stockReceipts.reduce(
        (total, receipt) => {
          return total + Number(receipt.quantityReceived);
        },
        0
      );

      return {
        itemId: item.id,
        productCode: item.productCode,
        itemCodeSku: item.itemCodeSku,
        itemFullName: item.itemFullName,
        category: item.category,
        supplier: earliestExpiringReceipt.supplier,
        dateReceived: earliestExpiringReceipt.dateReceived,
        expiryDate: earliestExpiringReceipt.expiryDate,
        daysUntilExpiry,
        urgencyLevel,
        quantityReceived: totalQuantityReceived,
        currentStock: totalCurrentStock,
        unitCost: earliestExpiringReceipt.unitCost,
        totalCost: earliestExpiringReceipt.totalCost,
        currency: earliestExpiringReceipt.currency,
        warehouse: earliestExpiringReceipt.warehouse,
        condition: earliestExpiringReceipt.condition,
        expectedSellPrice: latestExpectedSellPrice,
        tempReq: earliestExpiringReceipt.tempReq,
        uom: earliestExpiringReceipt.uom,
        approvedBy: latestApprovedBy,
        dateApproved: latestApprovalDate,
      };
    });

    type UrgencyLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

    const urgencyOrder: Record<UrgencyLevel, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };

    expiringData.sort((a, b) => {
      const urgencyComparison =
        urgencyOrder[a.urgencyLevel as UrgencyLevel] -
        urgencyOrder[b.urgencyLevel as UrgencyLevel];
      if (urgencyComparison !== 0) return urgencyComparison;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    const skip = page && limit ? (page - 1) * limit : 0;
    const paginatedData = limit
      ? expiringData.slice(skip, skip + limit)
      : expiringData;

    return {
      data: paginatedData,
      totalItems: expiringData.length,
      currentPage: page || 1,
      itemsPerPage: limit || expiringData.length,
      message: "Expiring items retrieved successfully",
    };
  }

  public static async getExpiredItems(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }
    await assertCompanyExists(companyId);

    // use current date to find items that are already expired
    const now = new Date();

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
            // { brandManufacturer: { contains: searchq } },
          ],
        }
      : {};

    const items = await prisma.items.findMany({
      where: {
        companyId,
        stockReceipts: {
          some: {
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
            ],
            expiryDate: {
              not: null,
              lte: now,
            },
          },
        },
        ...searchCondition,
      },
      include: {
        category: {
          select: {
            id: true,
            categoryName: true,
          },
        },
        stockReceipts: {
          where: {
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
            ],
            expiryDate: {
              not: null,
              lte: now,
            },
          },
          include: {
            supplier: {
              select: {
                id: true,
                supplierName: true,
              },
            },
            warehouse: true,
            stocks: {
              where: {
                status: { in: ["AVAILABLE", "RESERVED", "IN_TRANSIT"] },
              },
              select: {
                id: true,
                status: true,
              },
            },
            approvals: {
              where: { approvalStatus: "APPROVED" },
              orderBy: { dateApproved: "desc" },
              take: 1,
              select: {
                ExpectedSellPrice: true,
                dateApproved: true,
                approvedByUser: { select: { firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { expiryDate: "asc" },
        },
      },
    });

    const expiringData = items.map((item) => {
      const earliestExpiringReceipt = item.stockReceipts[0];

      const nowLocal = new Date();
      const expiryDate = new Date(earliestExpiringReceipt.expiryDate!);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - nowLocal.getTime()) / (1000 * 60 * 60 * 24)
      );

      let urgencyLevel = "LOW";
      if (daysUntilExpiry <= 7) {
        urgencyLevel = "CRITICAL";
      } else if (daysUntilExpiry <= 30) {
        urgencyLevel = "HIGH";
      } else if (daysUntilExpiry <= 60) {
        urgencyLevel = "MEDIUM";
      }

      const totalCurrentStock = item.stockReceipts.reduce((total, receipt) => {
        return total + receipt.stocks.length;
      }, 0);

      let latestExpectedSellPrice = null;
      let latestApprovalDate: Date | null = null;
      let latestApprovedBy = null;

      item.stockReceipts.forEach((receipt) => {
        if (receipt.approvals[0]) {
          const approval = receipt.approvals[0];
          if (
            !latestApprovalDate ||
            new Date(approval.dateApproved) > new Date(latestApprovalDate)
          ) {
            latestExpectedSellPrice = approval.ExpectedSellPrice;
            latestApprovalDate = approval.dateApproved;
            latestApprovedBy = `${approval.approvedByUser.firstName} ${approval.approvedByUser.lastName}`;
          }
        }
      });

      const totalQuantityReceived = item.stockReceipts.reduce(
        (total, receipt) => {
          return total + Number(receipt.quantityReceived);
        },
        0
      );

      return {
        itemId: item.id,
        productCode: item.productCode,
        itemCodeSku: item.itemCodeSku,
        itemFullName: item.itemFullName,
        category: item.category,
        supplier: earliestExpiringReceipt.supplier,
        dateReceived: earliestExpiringReceipt.dateReceived,
        expiryDate: earliestExpiringReceipt.expiryDate,
        daysUntilExpiry,
        urgencyLevel,
        quantityReceived: totalQuantityReceived,
        currentStock: totalCurrentStock,
        unitCost: earliestExpiringReceipt.unitCost,
        totalCost: earliestExpiringReceipt.totalCost,
        currency: earliestExpiringReceipt.currency,
        warehouse: earliestExpiringReceipt.warehouse,
        condition: earliestExpiringReceipt.condition,
        expectedSellPrice: latestExpectedSellPrice,
        tempReq: earliestExpiringReceipt.tempReq,
        uom: earliestExpiringReceipt.uom,
        approvedBy: latestApprovedBy,
        dateApproved: latestApprovalDate,
      };
    });

    type UrgencyLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

    const urgencyOrder: Record<UrgencyLevel, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
    };

    expiringData.sort((a, b) => {
      const urgencyComparison =
        urgencyOrder[a.urgencyLevel as UrgencyLevel] -
        urgencyOrder[b.urgencyLevel as UrgencyLevel];
      if (urgencyComparison !== 0) return urgencyComparison;
      return a.daysUntilExpiry - b.daysUntilExpiry;
    });

    const skip = page && limit ? (page - 1) * limit : 0;
    const paginatedData = limit
      ? expiringData.slice(skip, skip + limit)
      : expiringData;

    return {
      data: paginatedData,
      totalItems: expiringData.length,
      currentPage: page || 1,
      itemsPerPage: limit || expiringData.length,
      message: "Expired items retrieved successfully",
    };
  }

  public static async addDirectStock(
    req: Request,
    stockData: {
      itemId: string;
      supplierId?: string;
      dateReceived: Date;
      expiryDate?: Date;
      quantityReceived: number;
      unitCost: number;
      packSize?: number;
      uom: string;
      tempReq: string;
      currency: string;
      condition: string;
      warehouseId: string;
      reason: string;
      specialHandlingNotes?: string;
      remarksNotes?: string;
    }
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    const item = await prisma.items.findFirst({
      where: {
        id: stockData.itemId,
        companyId: companyId,
      },
    });

    if (!item) {
      throw new AppError(
        "Item not found or doesn't belong to your company",
        404
      );
    }

    const totalCost = stockData.unitCost * stockData.quantityReceived;

    const stockReceipt = await prisma.stockReceipts.create({
      data: {
        itemId: stockData.itemId,
        companyId: companyId,
        supplierId: stockData.supplierId,
        dateReceived: stockData.dateReceived,
        expiryDate: stockData.expiryDate,
        quantityReceived: stockData.quantityReceived,
        unitCost: stockData.unitCost,
        totalCost: totalCost,
        packSize: stockData.packSize,
        uom: stockData.uom,
        tempReq: stockData.tempReq,
        currency: stockData.currency,
        condition: stockData.condition,
        // Normalize empty string to null so the foreign key constraint is not violated
        warehouseId: stockData.warehouseId ? stockData.warehouseId : null,
        specialHandlingNotes: stockData.specialHandlingNotes,
        remarksNotes: `${stockData.reason}${stockData.remarksNotes ? ` | ${stockData.remarksNotes}` : ""}`,
        receiptType: "DIRECT_ADDITION",
        purchaseOrderId: null,
        purchaseOrderItemId: null,
        invoiceNo: null,
      },
    });

    const stockPromises = Array.from(
      { length: stockData.quantityReceived },
      () =>
        prisma.stock.create({
          data: {
            stockReceiptId: stockReceipt.id,
            status: "AVAILABLE",
            quantity: 1,
            quantityAvailable: 1,
          },
        })
    );

    await Promise.all(stockPromises);

    return {
      stockReceipt,
      message: "Stock added directly to inventory successfully",
    };
  }
}
