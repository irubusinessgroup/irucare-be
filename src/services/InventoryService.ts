import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { assertCompanyExists } from "../utils/validators";
import * as XLSX from "xlsx";
import { ItemCodeGenerator } from "../utils/itemCodeGenerator";
import { applyMarkup } from "../utils/pricing";
import {
  DirectStockAdditionRequest,
  IPaged,
} from "../utils/interfaces/common";
import { StockService } from "./StockService";

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

    const searchCondition = searchq
      ? {
          OR: [
            { itemFullName: { contains: searchq } },
            { itemCodeSku: { contains: searchq } },
            // { brandManufacturer: { contains: searchq } },
          ],
        }
      : {};

    const branchId = req.user?.branchId;
    const items = await prisma.items.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
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
            ...(branchId ? { branchId } : {}),
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
              { receiptType: "DELIVERY" },
              { receiptType: "REFUND" },
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
        warehouse: latestReceipt.warehouse,
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

    const branchId = req.user?.branchId;
    const items = await prisma.items.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
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
    page?: number,
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

    const branchId = req.user?.branchId;
    const items = await prisma.items.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
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

    return await prisma.$transaction(async (tx) => {
      const item = await tx.items.findFirst({
        where: {
          id: stockData.itemId,
          companyId: companyId,
        },
      });

      if (!item) {
        throw new AppError(
          "Item not found or doesn't belong to your company",
          404,
        );
      }

      const totalCost = stockData.unitCost * stockData.quantityReceived;

      const branchId = req.user?.branchId;
      const stockReceipt = await tx.stockReceipts.create({
        data: {
          itemId: stockData.itemId,
          companyId: companyId,
          branchId: branchId as any,
          supplierId: stockData.supplierId,
          dateReceived: new Date(stockData.dateReceived),
          expiryDate: stockData.expiryDate
            ? new Date(stockData.expiryDate)
            : null,
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

      // Fetch company tools for markup
      const companyTools = await tx.companyTools.findFirst({
        where: { companyId },
      });
      const markupPercentage = Number(companyTools?.markupPrice || 0);
      const calculatedSellPrice = applyMarkup(
        stockData.unitCost,
        markupPercentage,
      );

      await tx.approvals.create({
        data: {
          stockReceiptId: stockReceipt.id,
          approvedByUserId: userId,
          approvalStatus: "APPROVED", // Directly approved
          ExpectedSellPrice: calculatedSellPrice,
          dateApproved: new Date(),
          comments: stockData.reason,
        },
      });

      await StockService.addToStock(stockReceipt.id, tx, userId);

      return {
        stockReceipt,
        message: "Stock added directly to inventory successfully",
      };
    }, { timeout: 120000 });
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
          const newItem = await prisma.items.create({
            data: {
              itemFullName: repRow!.itemName, // Use original casing
              categoryId,
              companyId,
              branchId: branchId as any,
              itemCodeSku: itemCode,
              minLevel: 10,
              maxLevel: 100,
              isTaxable,
              taxCode: ["A", "B"].includes(taxCode) ? taxCode : "A",
              taxRate,
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

    // 2. Process Transactions in Batches
    // We group rows into chunks (e.g., 50 rows per transaction) to manage memory and connections.
    const BATCH_SIZE = 50;
    let successfulImports = 0;

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);

      try {
        await prisma.$transaction(
          async (tx) => {
            for (const row of batch) {
              const itemId = itemMap.get(row.itemName.toLowerCase());
              if (!itemId) {
                // Should have been created, if missing -> skip/error
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

              await StockService.addToStock(receipt.id, tx, userId);
            }
          },
          {
            timeout: 20000, // Increase timeout for batch
            maxWait: 5000,
          },
        );
        successfulImports += batch.length;
      } catch (err: any) {
        // If batch fails, log individual errors?
        // With transactions, the whole batch rolls back.
        // We add a generic error for the batch rows.
        batch.forEach((row) => {
          errors.push({
            row: row.rowNum,
            message: `Batch import failed: ${err.message}`,
            item: row.itemName,
          });
        });
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
}