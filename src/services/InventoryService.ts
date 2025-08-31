import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";

export class InventoryService {
  public static async getInventory(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
            { brandManufacturer: { contains: searchq } },
          ],
        }
      : {};

    const items = await prisma.items.findMany({
      where: {
        companyId,
        stockReceipts: {
          some: {
            approvals: { some: { approvalStatus: "APPROVED" } },
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
            approvals: { some: { approvalStatus: "APPROVED" } },
          },
          include: {
            supplier: {
              select: {
                id: true,
                supplierName: true,
              },
            },
            stocks: {
              where: { status: "AVAILABLE" },
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
      });

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
        0,
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
        ...new Set(item.stockReceipts.map((r) => r.supplier.supplierName)),
      ];

      const earliestExpiry = item.stockReceipts.reduce(
        (earliest, receipt) => {
          if (!receipt.expiryDate) return earliest;
          if (!earliest) return receipt.expiryDate;
          return new Date(receipt.expiryDate) < new Date(earliest)
            ? receipt.expiryDate
            : earliest;
        },
        null as Date | null,
      );

      return {
        itemId: item.id,
        itemCodeSku: item.itemCodeSku,
        productCode: item.productCode,
        itemFullName: item.itemFullName,
        category: item.category,
        suppliers: suppliers,
        primarySupplier: latestReceipt.supplier.supplierName,
        dateReceived: latestReceipt.dateReceived,
        expiryDate: earliestExpiry,
        totalQuantityReceived: totalQuantityReceived,
        currentStock: totalCurrentStock,
        avgUnitCost: avgUnitCost,
        totalValue: totalCurrentStock * avgUnitCost,
        currency: latestReceipt.currency,
        storageLocation: latestReceipt.storageLocation,
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
        brandManufacturer: item.brandManufacturer,
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
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
            { brandManufacturer: { contains: searchq } },
          ],
        }
      : {};

    const items = await prisma.items.findMany({
      where: {
        companyId,
        stockReceipts: {
          some: {
            approvals: { some: { approvalStatus: "APPROVED" } },
            expiryDate: {
              not: null,
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
            approvals: { some: { approvalStatus: "APPROVED" } },
            expiryDate: {
              not: null,
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
            stocks: {
              where: { status: "AVAILABLE" },
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

      const now = new Date();
      const expiryDate = new Date(earliestExpiringReceipt.expiryDate!);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
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
        0,
      );

      return {
        itemId: item.id,
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
        storageLocation: earliestExpiringReceipt.storageLocation,
        condition: earliestExpiringReceipt.condition,
        expectedSellPrice: latestExpectedSellPrice,
        tempReq: earliestExpiringReceipt.tempReq,
        uom: earliestExpiringReceipt.uom,
        approvedBy: latestApprovedBy,
        dateApproved: latestApprovalDate,
        brandManufacturer: item.brandManufacturer,
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
}
