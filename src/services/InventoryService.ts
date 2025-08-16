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
            {
              item: {
                itemFullName: { contains: searchq },
              },
            },
            {
              item: { itemCodeSku: { contains: searchq } },
            },
            {
              item: {
                brandManufacturer: { contains: searchq },
              },
            },
          ],
        }
      : {};

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const stockReceipts = await prisma.stockReceipts.findMany({
      where: {
        companyId,
        ...searchCondition,
      },
      skip,
      take,
      orderBy: { dateReceived: "desc" },
      include: {
        item: {
          select: {
            id: true,
            itemCodeSku: true,
            itemFullName: true,
            minLevel: true,
            maxLevel: true,
            brandManufacturer: true,
            category: {
              select: {
                id: true,
                categoryName: true,
              },
            },
          },
        },
        supplier: {
          select: {
            id: true,
            supplierName: true,
          },
        },
        stocks: {
          select: {
            id: true,
            status: true,
            // sellPrice: true,
            sell: { select: { id: true, sellPrice: true } },
          },
        },
      },
    });

    const inventoryData = stockReceipts.map((receipt) => {
      const currentStock = receipt.stocks.filter(
        (stock) => stock.status === "AVAILABLE",
      ).length;
      //   const totalReceived = Number(receipt.quantityReceived);
      const minLevel = Number(receipt.item.minLevel);
      const maxLevel = Number(receipt.item.maxLevel);

      let stockStatus = "NORMAL";
      if (currentStock <= minLevel) {
        stockStatus = "LOW_STOCK";
      } else if (currentStock >= maxLevel) {
        stockStatus = "OVER_STOCK";
      }

      return {
        id: receipt.id,
        item: receipt.item,
        supplier: receipt.supplier,
        dateReceived: receipt.dateReceived,
        expiryDate: receipt.expiryDate,
        quantityReceived: receipt.quantityReceived,
        currentStock,
        unitCost: receipt.unitCost,
        totalCost: receipt.totalCost,
        currency: receipt.currency,
        storageLocation: receipt.storageLocation,
        condition: receipt.condition,
        stockStatus,
        minLevel: receipt.item.minLevel,
        maxLevel: receipt.item.maxLevel,
        // sellPrice:  receipt.stocks[0]?.sellPrice ||
        sellPrice:
          receipt.stocks.find((stock) => stock.sell)?.sell?.sellPrice || null,
        tempReq: receipt.tempReq,
        uom: receipt.uom,
        packSize: receipt.packSize,
      };
    });

    const totalItems = await prisma.stockReceipts.count({
      where: {
        companyId,
        ...searchCondition,
      },
    });

    return {
      data: inventoryData,
      totalItems,
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
            {
              item: {
                itemFullName: { contains: searchq },
              },
            },
            {
              item: { itemCodeSku: { contains: searchq } },
            },
            {
              item: {
                brandManufacturer: { contains: searchq },
              },
            },
          ],
        }
      : {};

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const expiringItems = await prisma.stockReceipts.findMany({
      where: {
        companyId,
        expiryDate: {
          not: null,
          lte: threeMonthsFromNow,
        },
        ...searchCondition,
      },
      skip,
      take,
      orderBy: { expiryDate: "asc" },
      include: {
        item: {
          select: {
            id: true,
            itemCodeSku: true,
            itemFullName: true,
            minLevel: true,
            maxLevel: true,
            brandManufacturer: true,
            category: {
              select: {
                id: true,
                categoryName: true,
              },
            },
          },
        },
        supplier: {
          select: {
            id: true,
            supplierName: true,
          },
        },
        stocks: {
          where: {
            status: "AVAILABLE",
          },
          select: {
            id: true,
            status: true,
            // sellPrice: true,
            sell: { select: { id: true, sellPrice: true } },
          },
        },
      },
    });

    const expiringData = expiringItems.map((receipt) => {
      const now = new Date();
      const expiryDate = new Date(receipt.expiryDate!);
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

      const currentStock = receipt.stocks.length;

      return {
        id: receipt.id,
        item: receipt.item,
        supplier: receipt.supplier,
        dateReceived: receipt.dateReceived,
        expiryDate: receipt.expiryDate,
        daysUntilExpiry,
        urgencyLevel,
        quantityReceived: receipt.quantityReceived,
        currentStock,
        unitCost: receipt.unitCost,
        totalCost: receipt.totalCost,
        currency: receipt.currency,
        storageLocation: receipt.storageLocation,
        condition: receipt.condition,
        // sellPrice: receipt.stocks[0]?.sellPrice || null,
        sellPrice:
          receipt.stocks.find((stock) => stock.sell)?.sell?.sellPrice || null,
        tempReq: receipt.tempReq,
        uom: receipt.uom,
      };
    });

    const totalItems = await prisma.stockReceipts.count({
      where: {
        companyId,
        expiryDate: {
          not: null,
          lte: threeMonthsFromNow,
        },
        ...searchCondition,
      },
    });

    return {
      data: expiringData,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || expiringData.length,
      message: "Expiring items retrieved successfully",
    };
  }
}
