/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { assertCompanyExists } from "../utils/validators";
import * as XLSX from "xlsx";
import { Decimal } from "@prisma/client/runtime/library";
import { ItemCodeGenerator } from "../utils/itemCodeGenerator";
import { applyMarkup } from "../utils/pricing";
import { DirectStockAdditionRequest } from "../utils/interfaces/common";
import { StockService } from "./StockService";
import { EbmService } from "./EbmService";

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
    await assertCompanyExists(companyId);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
          ],
        }
      : {};

    const branchId = req.user?.branchId;
    const where: any = {
      companyId,
      ...(branchId ? { branchId } : {}),
      OR: [{ isStockItem: true }, { isStockItem: null }],
      stockReceipts: {
        some: {
          ...(branchId ? { branchId } : {}),
          OR: [
            { approvals: { some: { approvalStatus: "APPROVED" } } },
            { receiptType: "DIRECT_ADDITION" },
            { receiptType: "DELIVERY" },
            { receiptType: "REFUND" },
          ],
        },
      },
      ...searchCondition,
    };

    const [items, totalItems] = await Promise.all([
      prisma.items.findMany({
        where,
        select: {
          id: true,
          itemCodeSku: true,
          productCode: true,
          itemFullName: true,
          minLevel: true,
          maxLevel: true,
          insurancePrice: true,
          category: {
            select: {
              id: true,
              categoryName: true,
            },
          },
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
                { receiptType: "DELIVERY" },
                { receiptType: "REFUND" },
              ],
            },
            select: {
              id: true,
              dateReceived: true,
              expiryDate: true,
              quantityReceived: true,
              totalCost: true,
              currency: true,
              condition: true,
              tempReq: true,
              uom: true,
              packSize: true,
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
                },
              },
              approvals: {
                where: { approvalStatus: "APPROVED" },
                orderBy: { dateApproved: "desc" },
                take: 1,
                select: {
                  ExpectedSellPrice: true,
                  dateApproved: true,
                  approvedByUser: {
                    select: { firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
        skip,
        take: limitNum,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.items.count({ where }),
    ]);

    const inventoryData = items.map((item) => {
      const totalCurrentStock = item.stockReceipts.reduce(
        (total, receipt) => total + receipt.stocks.length,
        0,
      );

      const latestReceipt = item.stockReceipts.reduce(
        (latest, current) =>
          new Date(current.dateReceived) > new Date(latest.dateReceived)
            ? current
            : latest,
        item.stockReceipts[0],
      );

      const warehouseReceipt =
        item.stockReceipts.find((r) => r.warehouse) || latestReceipt;

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
        (total, receipt) => total + Number(receipt.quantityReceived),
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
        null as Date | null,
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
        warehouse: warehouseReceipt.warehouse,
        condition: latestReceipt.condition,
        stockStatus,
        minLevel: item.minLevel,
        maxLevel: item.maxLevel,
        insurancePrice: item.insurancePrice,
        expectedSellPrice: latestExpectedSellPrice,
        tempReq: latestReceipt.tempReq,
        uom: latestReceipt.uom,
        packSize: latestReceipt.packSize,
        approvedBy: latestApprovedBy,
        dateApproved: latestApprovalDate,
        totalReceipts: item.stockReceipts.length,
      };
    });

    return {
      data: inventoryData,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Inventory retrieved successfully",
    };
  }

  /** Export-only: returns ALL inventory items for the company/branch with no pagination.
   *  Uses the same query and data-mapping as getInventory — just without skip/take.
   */
  public static async getAllForExport(req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);
    await assertCompanyExists(companyId);

    const branchId = req.user?.branchId;
    const where: any = {
      companyId,
      ...(branchId ? { branchId } : {}),
      OR: [{ isStockItem: true }, { isStockItem: null }],
      stockReceipts: {
        some: {
          ...(branchId ? { branchId } : {}),
          OR: [
            { approvals: { some: { approvalStatus: "APPROVED" } } },
            { receiptType: "DIRECT_ADDITION" },
            { receiptType: "DELIVERY" },
            { receiptType: "REFUND" },
          ],
        },
      },
    };

    const items = await prisma.items.findMany({
      where,
      select: {
        id: true,
        itemCodeSku: true,
        productCode: true,
        itemFullName: true,
        minLevel: true,
        maxLevel: true,
        insurancePrice: true,
        category: { select: { id: true, categoryName: true } },
        stockReceipts: {
          where: {
            ...(branchId ? { branchId } : {}),
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
              { receiptType: "REFUND" },
            ],
          },
          select: {
            dateReceived: true,
            expiryDate: true,
            quantityReceived: true,
            totalCost: true,
            currency: true,
            condition: true,
            supplier: { select: { id: true, supplierName: true } },
            warehouse: true,
            stocks: {
              where: {
                status: { in: ["AVAILABLE", "RESERVED", "IN_TRANSIT"] },
              },
              select: { id: true },
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
      orderBy: { itemFullName: "asc" },
    });

    const data = items.map((item) => {
      const totalCurrentStock = item.stockReceipts.reduce(
        (t, r) => t + r.stocks.length,
        0,
      );
      const latestReceipt = item.stockReceipts.reduce(
        (latest, current) =>
          new Date(current.dateReceived) > new Date(latest.dateReceived)
            ? current
            : latest,
        item.stockReceipts[0],
      );
      const warehouseReceipt =
        item.stockReceipts.find((r) => r.warehouse) || latestReceipt;

      let latestExpectedSellPrice = null;
      let latestApprovalDate: Date | null = null;
      item.stockReceipts.forEach((receipt) => {
        if (receipt.approvals[0]) {
          const approval = receipt.approvals[0];
          if (
            !latestApprovalDate ||
            new Date(approval.dateApproved) > new Date(latestApprovalDate)
          ) {
            latestExpectedSellPrice = approval.ExpectedSellPrice;
            latestApprovalDate = approval.dateApproved;
          }
        }
      });

      const minLevel = Number(item.minLevel);
      const maxLevel = Number(item.maxLevel);
      let stockStatus = "NORMAL";
      if (totalCurrentStock <= minLevel) stockStatus = "LOW_STOCK";
      else if (totalCurrentStock >= maxLevel) stockStatus = "OVER_STOCK";

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
        productCode: item.productCode,
        itemFullName: item.itemFullName,
        category: item.category,
        primarySupplier: latestReceipt?.supplier?.supplierName,
        currentStock: totalCurrentStock,
        minLevel: item.minLevel,
        maxLevel: item.maxLevel,
        stockStatus,
        expectedSellPrice: latestExpectedSellPrice,
        insurancePrice: item.insurancePrice,
        currency: latestReceipt?.currency,
        warehouse: warehouseReceipt?.warehouse,
        condition: latestReceipt?.condition,
        expiryDate: earliestExpiry,
      };
    });

    return { data, totalItems: data.length, message: "Inventory export ready" };
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
    await assertCompanyExists(companyId);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const now = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
          ],
        }
      : {};

    const branchId = req.user?.branchId;
    const where: any = {
      companyId,
      ...(branchId ? { branchId } : {}),
      OR: [{ isStockItem: true }, { isStockItem: null }],
      stockReceipts: {
        some: {
          ...(branchId ? { branchId } : {}),
          OR: [
            { approvals: { some: { approvalStatus: "APPROVED" } } },
            { receiptType: "DIRECT_ADDITION" },
            { receiptType: "DELIVERY" },
            { receiptType: "REFUND" },
          ],
          expiryDate: {
            not: null,
            gt: now,
            lte: threeMonthsFromNow,
          },
        },
      },
      ...searchCondition,
    };

    const [items, totalItems] = await Promise.all([
      prisma.items.findMany({
        where,
        select: {
          id: true,
          productCode: true,
          itemCodeSku: true,
          itemFullName: true,
          insurancePrice: true,
          category: {
            select: {
              id: true,
              categoryName: true,
            },
          },
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
                { receiptType: "DELIVERY" },
                { receiptType: "REFUND" },
              ],
              expiryDate: {
                not: null,
                gt: now,
                lte: threeMonthsFromNow,
              },
            },
            select: {
              dateReceived: true,
              expiryDate: true,
              quantityReceived: true,
              unitCost: true,
              totalCost: true,
              currency: true,
              condition: true,
              tempReq: true,
              uom: true,
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
                },
              },
              approvals: {
                where: { approvalStatus: "APPROVED" },
                orderBy: { dateApproved: "desc" },
                take: 1,
                select: {
                  ExpectedSellPrice: true,
                  dateApproved: true,
                  approvedByUser: {
                    select: { firstName: true, lastName: true },
                  },
                },
              },
            },
            orderBy: { expiryDate: "asc" },
          },
        },
        skip,
        take: limitNum,
      }),
      prisma.items.count({ where }),
    ]);

    const expiringData = items.map((item) => {
      const earliestExpiringReceipt = item.stockReceipts[0];

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

      const totalCurrentStock = item.stockReceipts.reduce(
        (total, receipt) => total + receipt.stocks.length,
        0,
      );

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
        (total, receipt) => total + Number(receipt.quantityReceived),
        0,
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
        insurancePrice: item.insurancePrice,
        expectedSellPrice: latestExpectedSellPrice,
        tempReq: earliestExpiringReceipt.tempReq,
        uom: earliestExpiringReceipt.uom,
        approvedBy: latestApprovedBy,
        dateApproved: latestApprovalDate,
      };
    });

    return {
      data: expiringData,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Expiring items retrieved successfully",
    };
  }

  public static async getExpiredItems(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }
    await assertCompanyExists(companyId);

    const pageNum = Number(page) > 0 ? Number(page) : 1;
    const limitNum = Number(limit) > 0 ? Number(limit) : 15;
    const skip = (pageNum - 1) * limitNum;

    const now = new Date();

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
          ],
        }
      : {};

    const branchId = req.user?.branchId;
    const where: any = {
      companyId,
      ...(branchId ? { branchId } : {}),
      OR: [{ isStockItem: true }, { isStockItem: null }],
      stockReceipts: {
        some: {
          ...(branchId ? { branchId } : {}),
          OR: [
            { approvals: { some: { approvalStatus: "APPROVED" } } },
            { receiptType: "DIRECT_ADDITION" },
            { receiptType: "DELIVERY" },
            { receiptType: "REFUND" },
          ],
          expiryDate: {
            not: null,
            lte: now,
          },
        },
      },
      ...searchCondition,
    };

    const [items, totalItems] = await Promise.all([
      prisma.items.findMany({
        where,
        select: {
          id: true,
          productCode: true,
          itemCodeSku: true,
          itemFullName: true,
          insurancePrice: true,
          category: {
            select: {
              id: true,
              categoryName: true,
            },
          },
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
                { receiptType: "DELIVERY" },
                { receiptType: "REFUND" },
              ],
              expiryDate: {
                not: null,
                lte: now,
              },
            },
            select: {
              dateReceived: true,
              expiryDate: true,
              quantityReceived: true,
              unitCost: true,
              totalCost: true,
              currency: true,
              condition: true,
              tempReq: true,
              uom: true,
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
                },
              },
              approvals: {
                where: { approvalStatus: "APPROVED" },
                orderBy: { dateApproved: "desc" },
                take: 1,
                select: {
                  ExpectedSellPrice: true,
                  dateApproved: true,
                  approvedByUser: {
                    select: { firstName: true, lastName: true },
                  },
                },
              },
            },
            orderBy: { expiryDate: "asc" },
          },
        },
        skip,
        take: limitNum,
      }),
      prisma.items.count({ where }),
    ]);

    const expiringData = items.map((item) => {
      const earliestExpiringReceipt = item.stockReceipts[0];

      const nowLocal = new Date();
      const expiryDate = new Date(earliestExpiringReceipt.expiryDate!);
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - nowLocal.getTime()) / (1000 * 60 * 60 * 24),
      );

      let urgencyLevel = "LOW";
      if (daysUntilExpiry <= 7) {
        urgencyLevel = "CRITICAL";
      } else if (daysUntilExpiry <= 30) {
        urgencyLevel = "HIGH";
      } else if (daysUntilExpiry <= 60) {
        urgencyLevel = "MEDIUM";
      }

      const totalCurrentStock = item.stockReceipts.reduce(
        (total, receipt) => total + receipt.stocks.length,
        0,
      );

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
        (total, receipt) => total + Number(receipt.quantityReceived),
        0,
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
        insurancePrice: item.insurancePrice,
        expectedSellPrice: latestExpectedSellPrice,
        tempReq: earliestExpiringReceipt.tempReq,
        uom: earliestExpiringReceipt.uom,
        approvedBy: latestApprovedBy,
        dateApproved: latestApprovalDate,
      };
    });

    return {
      data: expiringData,
      totalItems,
      currentPage: pageNum,
      itemsPerPage: limitNum,
      message: "Expired items retrieved successfully",
    };
  }

  public static async addDirectStock(
    req: Request,
    stockData: DirectStockAdditionRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    const branchId = req.user?.branchId;

    // ─────────────────────────────────────────────────────────────────────
    // PRE-TRANSACTION: validate the item exists (read before opening tx)
    // ─────────────────────────────────────────────────────────────────────
    const item = await prisma.items.findFirst({
      where: { id: stockData.itemId, companyId },
    });

    if (!item) {
      throw new AppError(
        "Item not found or doesn't belong to your company",
        404,
      );
    }

    const totalCost = stockData.unitCost * stockData.quantityReceived;

    // PRE-TRANSACTION: calculate sell price (read before opening tx)
    const companyTools = await prisma.companyTools.findFirst({
      where: { companyId },
    });
    const markupPercentage = Number(companyTools?.markupPrice || 0);
    const calculatedSellPrice = applyMarkup(
      stockData.unitCost,
      markupPercentage,
    );

    // ─────────────────────────────────────────────────────────────────────
    // TRANSACTION: 3 pure writes only — receipt, approval, item flag.
    // No reads, no external API calls. Completes in < 300 ms.
    // ─────────────────────────────────────────────────────────────────────
    const stockReceiptId = await prisma.$transaction(async (tx) => {
      const stockReceipt = await tx.stockReceipts.create({
        data: {
          itemId: stockData.itemId,
          companyId,
          branchId: branchId as any,
          supplierId: stockData.supplierId,
          dateReceived: new Date(stockData.dateReceived),
          expiryDate: stockData.expiryDate
            ? new Date(stockData.expiryDate)
            : null,
          quantityReceived: stockData.quantityReceived,
          unitCost: stockData.unitCost,
          totalCost,
          packSize: stockData.packSize,
          uom: stockData.uom,
          tempReq: stockData.tempReq,
          currency: stockData.currency,
          condition: stockData.condition,
          warehouseId: stockData.warehouseId || null,
          specialHandlingNotes: stockData.specialHandlingNotes,
          remarksNotes: `${stockData.reason}${stockData.remarksNotes ? ` | ${stockData.remarksNotes}` : ""}`,
          receiptType: "DIRECT_ADDITION",
          invoiceNo: null,
        },
      });

      await tx.approvals.create({
        data: {
          stockReceiptId: stockReceipt.id,
          approvedByUserId: userId,
          approvalStatus: "APPROVED",
          ExpectedSellPrice: calculatedSellPrice,
          dateApproved: new Date(),
          comments: stockData.reason,
        },
      });

      await tx.items.update({
        where: { id: stockData.itemId },
        data: { isStockItem: true },
      });

      return stockReceipt.id;
    }); // 3 pure writes — safe within default 5 s timeout

    // ─────────────────────────────────────────────────────────────────────
    // POST-TRANSACTION: EBM registration + stock unit creation.
    // StockService.addToStock makes an EBM HTTP call — running it OUTSIDE
    // the transaction prevents DB timeout if EBM is slow.
    // ─────────────────────────────────────────────────────────────────────
    await StockService.addToStock(stockReceiptId, undefined, userId);

    return {
      stockReceiptId,
      message: "Stock added directly to inventory successfully",
    };
  }
  public static async downloadStockTemplate() {
    // Headers requested: NO, ITEM NAME, TAX CODE, QTIES, UNIT COST, TOTAL COST, UNIT PRICE, TOTAL PRICE
    const headers = [
      "NO",
      "ITEM NAME",
      "TAX CODE",
      "QTIES",
      "UNIT COST",
      "TOTAL COST",
      "UNIT PRICE",
      "TOTAL PRICE",
    ];

    const sampleData = [
      {
        NO: 1,
        "ITEM NAME": "Paracetamol 500mg",
        "TAX CODE": "B",
        QTIES: 100,
        "UNIT COST": 500,
        "TOTAL COST": 50000,
        "UNIT PRICE": 700,
        "TOTAL PRICE": 70000,
      },
      {
        NO: 2,
        "ITEM NAME": "Amoxicillin 250mg",
        "TAX CODE": "A",
        QTIES: 50,
        "UNIT COST": 1000,
        "TOTAL COST": 50000,
        "UNIT PRICE": 1500,
        "TOTAL PRICE": 75000,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Import");

    // Adjust column widths
    const colWidths = headers.map((header) => ({
      wch: Math.max(header.length + 5, 15),
    }));
    worksheet["!cols"] = colWidths;

    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  }

  public static async importStock(
    file: Express.Multer.File,
    companyId: string,
    userId: string,
    branchId?: string | null,
  ) {
    if (!file || !file.buffer) {
      throw new AppError(
        "File buffer is missing. Ensure this route uses multer.memoryStorage().",
        400,
      );
    }

    // Parse Excel
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    if (!workbook || workbook.SheetNames.length === 0) {
      throw new AppError("Uploaded Excel file has no sheets", 400);
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 1. Detect Header Row
    // Read raw data as array of arrays first to find the header
    const rawMatrix = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    }) as any[][];

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(20, rawMatrix.length); i++) {
      const row = rawMatrix[i];
      // simplistic check: looks for "ITEM NAME"
      const rowString = row.map((cell) => String(cell).toUpperCase().trim());
      if (rowString.includes("ITEM NAME")) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new AppError(
        "Could not find 'ITEM NAME' header in the first 20 rows.",
        400,
      );
    }

    // 2. Parse Data using the found header row
    const rawData = XLSX.utils.sheet_to_json(worksheet, {
      range: headerRowIndex, // Start reading from this row
      defval: "",
    }) as Array<Record<string, unknown>>;

    if (rawData.length === 0) {
      throw new AppError("Excel file has no data rows", 400);
    }

    // Normalize keys to support case-insensitive matching
    const normalizedData = rawData.map((row) => {
      const newRow: Record<string, unknown> = {};
      Object.keys(row).forEach((key) => {
        newRow[key.toUpperCase().trim()] = row[key];
      });
      return newRow;
    });

    const errors: any[] = [];
    const validRows: any[] = [];

    // Pre-processing: Validate and Collect Data
    for (let i = 0; i < normalizedData.length; i++) {
      const row = normalizedData[i];
      // Accurate row number: Header Index (0-based) + 1 (Header Row) + 1 (Next Row) + i
      const rowNum = headerRowIndex + 2 + i;

      // Extract fields
      const itemNameRaw = row["ITEM NAME"];
      const taxCodeRaw = row["TAX CODE"];
      const qtiesRaw = row["QTIES"];
      const unitCostRaw = row["UNIT COST"];
      const totalCostRaw = row["TOTAL COST"];
      const unitPriceRaw = row["UNIT PRICE"];

      // Skip empty rows (check if all key fields are empty/whitespace)
      const isEmpty =
        !String(itemNameRaw || "").trim() &&
        !String(qtiesRaw || "").trim() &&
        !String(unitCostRaw || "").trim();

      if (isEmpty) continue;

      if (!itemNameRaw || !String(itemNameRaw).trim()) {
        errors.push({ row: rowNum, message: "ITEM NAME is required" });
        continue;
      }

      const itemName = String(itemNameRaw).trim();

      // Helper to parse numbers
      const parseNumber = (val: any) => {
        if (typeof val === "number") return val;
        if (!val) return 0;
        // Remove commas and spaces
        const cleaned = String(val).replace(/,/g, "").trim();
        if (cleaned === "") return 0;
        const num = Number(cleaned);
        return isNaN(num) ? 0 : num;
      };

      const quantity = parseNumber(qtiesRaw);
      const unitCost = parseNumber(unitCostRaw);
      const unitPrice = parseNumber(unitPriceRaw);
      let totalCost = parseNumber(totalCostRaw);

      // Validations
      // if (quantity <= 0) {
      //   errors.push({
      //     row: rowNum,
      //     message: "QTIES must be a positive number",
      //     item: itemName,
      //   });
      //   continue;
      // }
      if (unitCost < 0) {
        errors.push({
          row: rowNum,
          message: "UNIT COST must be a non-negative number",
          item: itemName,
        });
        continue;
      }

      if (totalCost <= 0 && quantity > 0 && unitCost > 0) {
        totalCost = quantity * unitCost;
      }

      validRows.push({
        rowNum,
        itemName,
        taxCode: String(taxCodeRaw || "A").toUpperCase(),
        quantity,
        unitCost,
        totalCost,
        unitPrice,
      });
    }

    if (validRows.length === 0) {
      return {
        message: "No valid rows found to import",
        data: {
          total: normalizedData.length,
          successful: 0,
          failed: errors.length,
          errors,
        },
      };
    }

    // --- Batch Processing Start ---

    // 1. Resolve Items (Find existing or Create missing)
    // Get all unique item names from valid rows
    const uniqueItemNames = Array.from(
      new Set(validRows.map((r) => r.itemName.toLowerCase())),
    );

    // Fetch existing matches
    const existingItems = await prisma.items.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        itemFullName: { in: uniqueItemNames, mode: "insensitive" },
      },
      select: { id: true, itemFullName: true },
    });

    const itemMap = new Map<string, string>(); // Name(lower) -> ID
    existingItems.forEach((item) =>
      itemMap.set(item.itemFullName.toLowerCase(), item.id),
    );

    // Identify missing items
    const missingItemNames = uniqueItemNames.filter(
      (name) => !itemMap.has(name),
    );

    // Ensure "General" category exists
    let generalCategory = await prisma.itemCategories.findFirst({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        categoryName: { equals: "General", mode: "insensitive" },
      },
    });

    if (!generalCategory) {
      generalCategory = await prisma.itemCategories.create({
        data: {
          categoryName: "General",
          companyId,
          branchId: branchId as any,
          description: "Default category for imported items",
        },
      });
    }
    const categoryId = generalCategory.id;

    // Get company and user for EBM registration
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    const user = await prisma.user.findFirst({
      where: {
        company: { companyId },
        userRoles: {
          some: { name: "COMPANY_ADMIN" },
        },
      },
    });

    // Bulk Create Missing Items
    // Requires generating unique SKUs for each.
    // We'll process them in sequence or parallel promises since we need individual IDs and SKUs.
    if (missingItemNames.length > 0) {
      // Use concurrency control to speed up but not overload
      // Or just simple loop since Item creation isn't *that* heavy compared to millions of stocks.
      for (const name of missingItemNames) {
        // Find a representative row to get tax info (optimistic: take first occurrence)
        const repRow = validRows.find((r) => r.itemName.toLowerCase() === name);
        const taxCode = repRow ? repRow.taxCode : "A";
        const isTaxable = taxCode === "B";
        const taxRate = isTaxable ? 18.0 : 0.0;

        try {
          const itemCode = await ItemCodeGenerator.generate(categoryId);
          // Generate product code for the new item
          const { productCode } = await (
            await import("./ItemService")
          ).ItemService.generateProductCode(companyId);

          // Register with EBM before creating locally
          let ebmSynced = false;
          if (company && user) {
            const itemData = {
              itemFullName: repRow!.itemName,
              productCode,
              isTaxable,
              taxCode: ["A", "B"].includes(taxCode) ? taxCode : "A",
              taxRate,
            };

            const { EbmService } = await import("./EbmService");
            const ebmResponse = await EbmService.saveItemToEBM(
              itemData,
              company,
              user,
              branchId,
            );

            if (ebmResponse.resultCd === "000") {
              ebmSynced = true;
            } else {
              console.warn(
                `EBM registration failed for ${repRow!.itemName}: ${ebmResponse.resultMsg}`,
              );
              // Continue anyway, but mark as not synced
            }
          }

          const newItem = await prisma.items.create({
            data: {
              itemFullName: repRow!.itemName, // Use original casing
              categoryId,
              companyId,
              branchId: branchId as any,
              itemCodeSku: itemCode,
              productCode, // Add generated product code
              minLevel: 10,
              maxLevel: 100,
              isTaxable,
              taxCode: ["A", "B"].includes(taxCode) ? taxCode : "A",
              taxRate,
              ebmSynced, // Mark based on EBM registration result
            },
            select: { id: true, itemFullName: true },
          });
          itemMap.set(name, newItem.id);
        } catch (err) {
          // If item creation fails, rows dependent on it will fail later or we skip them
          console.error(`Failed to auto-create item ${name}`, err);
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Process DB writes in batches, EBM + stock-unit creation AFTER each batch
    //
    // Pattern mirrors SellService.createSell:
    //   TRANSACTION  → pure writes only  (receipt + approval + item flag)
    //   POST-TX      → addToStock per receipt (EBM HTTP call + stock.createMany)
    //
    // Why: StockService.addToStock calls EbmService.saveStockToEBM (external
    // HTTP). Holding a Prisma transaction open during a network call causes the
    // 5 s default timeout to fire on any slow EBM response.
    // ─────────────────────────────────────────────────────────────────────
    const BATCH_SIZE = 50;
    let successfulImports = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      // Step A: commit all DB writes for this batch atomically (no EBM calls)
      let batchReceiptIds: string[] = [];
      try {
        batchReceiptIds = await prisma.$transaction(async (tx) => {
          const ids: string[] = [];

          for (const row of batch) {
            const itemId = itemMap.get(row.itemName.toLowerCase());
            if (!itemId) {
              throw new Error(`Item ${row.itemName} could not be resolved`);
            }

            // Create Receipt
            const receipt = await tx.stockReceipts.create({
              data: {
                itemId,
                companyId,
                branchId: branchId as any,
                dateReceived: new Date(),
                quantityReceived: row.quantity,
                unitCost: row.unitCost,
                totalCost: row.totalCost,
                receiptType: "DIRECT_ADDITION",
                remarksNotes: `Bulk Import - ${row.itemName}`,
              },
            });

            // Create Approval
            await tx.approvals.create({
              data: {
                stockReceiptId: receipt.id,
                approvedByUserId: userId,
                approvalStatus: "APPROVED",
                ExpectedSellPrice: row.unitPrice,
                dateApproved: new Date(),
                comments: "Auto-approved via Bulk Import",
              },
            });

            await tx.items.update({
              where: { id: itemId },
              data: { isStockItem: true },
            });

            ids.push(receipt.id);
          }

          return ids;
        }); // pure writes — safe within default 5 s timeout

        successfulImports += batch.length;
      } catch (err: any) {
        // Entire batch rolled back — record errors for each row
        batch.forEach((row) => {
          errors.push({
            row: row.rowNum,
            message: `Batch DB write failed: ${err.message}`,
            item: row.itemName,
          });
        });
        continue; // skip addToStock for this batch since nothing was committed
      }

      // Step B: EBM registration + stock unit creation, one receipt at a time.
      // Running outside the transaction — a slow/failing EBM call no longer
      // blocks or rolls back the DB writes above.
      for (const receiptId of batchReceiptIds) {
        try {
          await StockService.addToStock(receiptId, undefined, userId);
        } catch (err: any) {
          console.error(
            `[importStock] addToStock failed for receipt ${receiptId}: ${err.message}`,
          );
          // Stock record is committed; EBM can be re-synced later.
          // We don't roll back or decrement successfulImports here.
        }
      }
    }

    return {
      message: "Stock import processing completed",
      data: {
        total: rawData.length, // total rows in sheet
        successful: successfulImports,
        failed: errors.length,
        errors: errors.slice(0, 100), // Limit error output size
      },
    };
  }

  /**
   * Syncs the current master inventory (rsdQty = Remain Quantity) of all products
   * with the EBM RRA server via the /stockMaster/saveStockMaster endpoint.
   *
   * IMPORTANT: This also activates any pending EBM stock (status = PENDING_EBM_SYNC)
   * and makes it available for sale.
   */
  public static async syncEbmStockMaster(
    companyId: string,
    userId: string,
    branchId: string | null,
    itemIds?: string[],
  ): Promise<any> {
    await assertCompanyExists(companyId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, TIN: true },
    });

    if (!company?.TIN) {
      throw new AppError("Company TIN is missing", 400);
    }

    // STEP 1: Find all pending stock receipts (ebmSynced = false)
    const pendingReceipts = await prisma.stockReceipts.findMany({
      where: {
        companyId,
        ebmSynced: false,
        ...(itemIds?.length ? { itemId: { in: itemIds } } : {}),
      },
      include: {
        stocks: {
          where: { status: "PENDING_EBM_SYNC" },
        },
        item: true,
      },
    });

    console.log(
      `[EBM Sync] Found ${pendingReceipts.length} pending receipts to activate`,
    );

    // Get all items that are stocked and have a product code
    const items = await prisma.items.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        productCode: { not: null },
        ...(itemIds?.length ? { id: { in: itemIds } } : {}),
      },
      include: {
        stockReceipts: {
          include: {
            stocks: {
              where: {
                status: { in: ["AVAILABLE", "RESERVED", "PENDING_EBM_SYNC"] },
              },
            },
          },
        },
      },
    });

    const results = [];
    let successCount = 0;
    let failCount = 0;
    let activatedCount = 0;

    // Loop through each product to calculate Remain Quantity (rsdQty)
    for (const item of items) {
      if (!item.productCode) continue;

      // Calculate total quantity including pending
      const rsdQty = item.stockReceipts.reduce((sum, receipt) => {
        return (
          sum +
          receipt.stocks.reduce(
            (stockSum, stock) => stockSum + Number(stock.quantityAvailable),
            0,
          )
        );
      }, 0);

      if (rsdQty > 0) {
        try {
          // ALWAYS activate local stock for pending receipts related to this item FIRST
          // to ensure local app stays usable even if EBM is offline or throws errors.
          const itemPendingReceipts = pendingReceipts.filter(
            (r) => r.itemId === item.id,
          );

          let expectedSellPrice = 0;

          for (const receipt of itemPendingReceipts) {
            // Update stock status from PENDING_EBM_SYNC to AVAILABLE
            const updatedStocks = await prisma.stock.updateMany({
              where: {
                stockReceiptId: receipt.id,
                status: "PENDING_EBM_SYNC",
              },
              data: {
                status: "AVAILABLE",
              },
            });

            // Update receipt ebmSynced flag
            await prisma.stockReceipts.update({
              where: { id: receipt.id },
              data: { ebmSynced: true },
            });

            // --- PRICING LOGIC ---
            const approvalRec = await prisma.approvals.findFirst({
              where: { stockReceiptId: receipt.id },
              orderBy: { dateApproved: "desc" },
            });

            expectedSellPrice =
              Number(approvalRec?.ExpectedSellPrice) || expectedSellPrice;

            if (approvalRec && approvalRec.approvalStatus === "PENDING") {
              await prisma.approvals.update({
                where: { id: approvalRec.id },
                data: { approvalStatus: "APPROVED", dateApproved: new Date() },
              });
            }

            if (expectedSellPrice) {
              const allReceipts = await prisma.stockReceipts.findMany({
                where: { itemId: item.id },
                select: { id: true },
              });
              const receiptIds = allReceipts.map((r: any) => r.id);

              await prisma.approvals.updateMany({
                where: {
                  stockReceiptId: { in: receiptIds },
                  approvalStatus: "APPROVED",
                },
                data: { ExpectedSellPrice: expectedSellPrice },
              });
            }
            // -----------------------

            activatedCount += updatedStocks.count;
            console.log(
              `[EBM Sync] Activated ${updatedStocks.count} units for ${item.itemFullName}`,
            );
          }

          // Register or update the Item (with its new Expected Sell Price) on EBM
          if (expectedSellPrice) {
            (item as any).expectedSellPrice = expectedSellPrice;
          }
          await EbmService.saveItemToEBM(item, company, user, branchId);

          // Push Stock Master using EBM-initialized branch (not local branch UUID)
          const resolvedBhfId = await EbmService.resolveCompanyBhfId(companyId);

          // Push Stock Master
          const ebmResponse = await EbmService.saveStockMasterToEbm(
            company.TIN,
            resolvedBhfId,
            item.productCode,
            rsdQty,
            user,
          );

          if (ebmResponse.resultCd === "000") {
            successCount++;

            // POST-SYNC: EBM Stock Telemetry (01 - Import, 02 - Purchase, 14 - Adjustment)
            for (const receipt of itemPendingReceipts) {
              try {
                let code = "14"; // Default Stock Addition Adjustment
                const rType = (receipt.receiptType || "").toUpperCase();
                if (rType.includes("IMPORT")) code = "01";
                if (rType.includes("PURCHASE")) code = "02";
                if (rType.includes("REFUND")) code = "03";

                await EbmService.saveStockItems(
                  code,
                  [{ ...receipt, item: item }], // Unified payload wrapper
                  company,
                  user,
                  branchId,
                  `Stock Sync Activation: ${rType || "Adjustment"}`,
                );
              } catch (err) {
                console.error(
                  "Non-fatal: saveStockItems delta telemetry failed",
                  err,
                );
              }
            }
          } else {
            failCount++;
            console.error(
              `[EBM StockMaster] Failed to sync Item ${item.itemFullName}:`,
              ebmResponse,
            );
          }

          results.push({
            itemCode: item.productCode,
            itemName: item.itemFullName,
            qty: rsdQty,
            ebmResponse,
          });
        } catch (err: any) {
          failCount++;
          console.error(
            `[EBM StockMaster] Exception syncing Item ${item.itemFullName}:`,
            err,
          );
        }
      }
    }

    return {
      message: `Stock Master Sync completed. Success: ${successCount}, Failed: ${failCount}, Activated: ${activatedCount} units`,
      data: {
        results,
        activatedUnits: activatedCount,
        successCount,
        failCount,
      },
    };
  }

  /**
   * Update the expiry date of the earliest-expiring stock receipt for an item.
   * The inventory view shows the earliest expiry across receipts, so that is the
   * one the user sees and wants to edit.
   */
  public static async updateItemExpiry(
    companyId: string,
    userId: string,
    itemId: string,
    expiryDate: string | null,
  ) {
    await assertCompanyExists(companyId);

    if (!itemId) throw new AppError("Item ID is required", 400);

    const item = await prisma.items.findFirst({ where: { id: itemId, companyId } });
    if (!item) throw new AppError("Item not found", 404);

    // Target the receipt that currently holds the earliest expiry (what the UI displays)
    const receipt = await prisma.stockReceipts.findFirst({
      where: { itemId, companyId, expiryDate: { not: null } },
      orderBy: { expiryDate: "asc" },
    });

    if (!receipt) throw new AppError("No stock receipt with an expiry date found for this item", 400);

    await prisma.stockReceipts.update({
      where: { id: receipt.id },
      data: { expiryDate: expiryDate ? new Date(expiryDate) : null },
    });

    return {
      message: "Expiry date updated successfully",
      data: { itemId, expiryDate },
    };
  }

  /**
   * Update the expectedSellPrice of an item by updating/creating an approval record
   * with the new price
   */
  public static async updateItemPrice(
    companyId: string,
    userId: string,
    itemId: string,
    expectedSellPrice: number,
  ) {
    await assertCompanyExists(companyId);

    if (!itemId) {
      throw new AppError("Item ID is required", 400);
    }

    if (typeof expectedSellPrice !== "number" || expectedSellPrice < 0) {
      throw new AppError("Price must be a non-negative number", 400);
    }

    // Verify item exists and belongs to the company
    const item = await prisma.items.findFirst({
      where: { id: itemId, companyId },
      include: { stockReceipts: { take: 1, orderBy: { createdAt: "desc" } } },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    // Get the most recent stock receipt for this item
    const latestReceipt = item.stockReceipts?.[0];
    if (!latestReceipt) {
      throw new AppError(
        "No stock receipts found for this item. Cannot update price.",
        400,
      );
    }

    // Create or update approval with the new price
    const approval = await prisma.approvals.create({
      data: {
        stockReceiptId: latestReceipt.id,
        approvedByUserId: userId,
        ExpectedSellPrice: new Decimal(expectedSellPrice),
        dateApproved: new Date(),
        approvalStatus: "APPROVED",
        comments: "Price updated from inventory management",
      },
    });

    return {
      message: "Item price updated successfully",
      data: {
        itemId,
        expectedSellPrice: approval.ExpectedSellPrice,
      },
    };
  }
}
