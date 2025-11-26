import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import { NotificationHelper } from "../utils/notificationHelper";
import { Server as SocketIOServer } from "socket.io";

interface CreateReorderRuleDto {
  itemId: string;
  warehouseId?: string; // Optional: specific to warehouse
  minLevel: number;
  maxLevel: number;
  reorderPoint: number;
  reorderQuantity: number;
  autoReorder?: boolean; // Auto-generate PO when stock hits reorder point
  preferredSupplierId?: string;
  leadTimeDays?: number;
  notes?: string;
}

interface AlertPreferenceDto {
  alertType:
    | "LOW_STOCK"
    | "EXPIRING_SOON"
    | "EXPIRED"
    | "OVERSTOCK"
    | "REORDER_POINT";
  enabled: boolean;
  emailNotification?: boolean;
  systemNotification?: boolean;
  thresholdDays?: number; // For expiry alerts
}

export class ReorderAlertsService {
  /**
   * Create or update reorder rule for an item
   */
  public static async createReorderRule(
    req: Request,
    data: CreateReorderRuleDto
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    // Validate item
    const item = await prisma.items.findFirst({
      where: { id: data.itemId, companyId },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    // Validate warehouse if provided
    if (data.warehouseId) {
      const warehouse = await prisma.warehouse.findFirst({
        where: { id: data.warehouseId, companyId },
      });
      if (!warehouse) {
        throw new AppError("Warehouse not found", 404);
      }
    }

    // Validate supplier if provided
    if (data.preferredSupplierId) {
      const supplier = await prisma.suppliers.findFirst({
        where: { id: data.preferredSupplierId, companyId },
      });
      if (!supplier) {
        throw new AppError("Supplier not found", 404);
      }
    }

    // Check if rule already exists
    const existingRule = await prisma.reorderRule.findFirst({
      where: {
        itemId: data.itemId,
        companyId,
        warehouseId: data.warehouseId || null,
      },
    });

    if (existingRule) {
      // Update existing rule
      const updated = await prisma.reorderRule.update({
        where: { id: existingRule.id },
        data: {
          minLevel: data.minLevel,
          maxLevel: data.maxLevel,
          reorderPoint: data.reorderPoint,
          reorderQuantity: data.reorderQuantity,
          autoReorder: data.autoReorder ?? false,
          preferredSupplierId: data.preferredSupplierId,
          leadTimeDays: data.leadTimeDays,
          notes: data.notes,
        },
        include: {
          item: true,
          warehouse: true,
          preferredSupplier: true,
        },
      });

      return {
        message: "Reorder rule updated successfully",
        data: updated,
      };
    }

    // Create new rule
    const rule = await prisma.reorderRule.create({
      data: {
        itemId: data.itemId,
        companyId,
        warehouseId: data.warehouseId,
        minLevel: data.minLevel,
        maxLevel: data.maxLevel,
        reorderPoint: data.reorderPoint,
        reorderQuantity: data.reorderQuantity,
        autoReorder: data.autoReorder ?? false,
        preferredSupplierId: data.preferredSupplierId,
        leadTimeDays: data.leadTimeDays,
        notes: data.notes,
      },
      include: {
        item: true,
        warehouse: true,
        preferredSupplier: true,
      },
    });

    return {
      message: "Reorder rule created successfully",
      data: rule,
    };
  }

  /**
   * Get all reorder rules
   */
  public static async getReorderRules(
    req: Request,
    filters?: {
      itemId?: string;
      warehouseId?: string;
      belowReorderPoint?: boolean;
    },
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const where: any = { companyId };
    if (filters?.itemId) where.itemId = filters.itemId;
    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;

    const skip = page && limit ? (page - 1) * limit : 0;

    const [rules, total] = await Promise.all([
      prisma.reorderRule.findMany({
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
              category: { select: { categoryName: true } },
            },
          },
          warehouse: {
            select: { id: true, warehousename: true },
          },
          preferredSupplier: {
            select: { id: true, supplierName: true },
          },
        },
      }),
      prisma.reorderRule.count({ where }),
    ]);

    // Calculate current stock levels for each rule
    const rulesWithStock = await Promise.all(
      rules.map(async (rule) => {
        const stockQuery: any = {
          stockReceipt: {
            itemId: rule.itemId,
            companyId,
          },
          status: { in: ["AVAILABLE", "RESERVED"] },
        };

        if (rule.warehouseId) {
          stockQuery.stockReceipt.warehouseId = rule.warehouseId;
        }

        const stocks = await prisma.stock.findMany({
          where: stockQuery,
        });

        const currentStock = stocks.reduce(
          (sum, stock) => sum + Number(stock.quantityAvailable),
          0
        );

        const needsReorder = currentStock <= rule.reorderPoint.toNumber();
        const isLowStock = currentStock <= rule.minLevel.toNumber();
        const isOverStock = currentStock >= rule.maxLevel.toNumber();

        return {
          ...rule,
          currentStock,
          needsReorder,
          isLowStock,
          isOverStock,
          stockStatus: isLowStock
            ? "LOW"
            : isOverStock
              ? "OVER"
              : needsReorder
                ? "REORDER"
                : "NORMAL",
        };
      })
    );

    // Filter by reorder point if requested
    const filteredRules = filters?.belowReorderPoint
      ? rulesWithStock.filter((r) => r.needsReorder)
      : rulesWithStock;

    return {
      data: filteredRules,
      totalItems: total,
      currentPage: page || 1,
      itemsPerPage: limit || filteredRules.length,
      message: "Reorder rules retrieved successfully",
    };
  }

  /**
   * Delete reorder rule
   */
  public static async deleteReorderRule(req: Request, ruleId: string) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const rule = await prisma.reorderRule.findFirst({
      where: { id: ruleId, companyId },
    });

    if (!rule) {
      throw new AppError("Reorder rule not found", 404);
    }

    await prisma.reorderRule.delete({ where: { id: ruleId } });

    return { message: "Reorder rule deleted successfully" };
  }

  /**
   * Check stock levels and generate alerts
   */
  public static async checkStockLevels(req: Request, io?: SocketIOServer) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const alerts: Array<{
      type: string;
      severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      itemId: string;
      itemName: string;
      message: string;
      currentStock: number;
      threshold?: number;
      warehouseId?: string;
      warehouseName?: string;
    }> = [];

    // Get all reorder rules
    const rules = await prisma.reorderRule.findMany({
      where: { companyId },
      include: {
        item: true,
        warehouse: true,
      },
    });

    // Check each rule
    for (const rule of rules) {
      const stockQuery: any = {
        stockReceipt: {
          itemId: rule.itemId,
          companyId,
        },
        status: { in: ["AVAILABLE", "RESERVED"] },
      };

      if (rule.warehouseId) {
        stockQuery.stockReceipt.warehouseId = rule.warehouseId;
      }

      const stocks = await prisma.stock.findMany({ where: stockQuery });

      const currentStock = stocks.reduce(
        (sum, stock) => sum + Number(stock.quantityAvailable),
        0
      );

      // Check for low stock
      if (currentStock <= rule.minLevel.toNumber()) {
        alerts.push({
          type: "LOW_STOCK",
          severity: currentStock === 0 ? "CRITICAL" : "HIGH",
          itemId: rule.itemId,
          itemName: rule.item.itemFullName,
          message: `${rule.item.itemFullName} is at critically low stock`,
          currentStock,
          threshold: rule.minLevel.toNumber(),
          warehouseId: rule.warehouseId || undefined,
          warehouseName: rule.warehouse?.warehousename,
        });

        // Create alert record
        await prisma.stockAlert.create({
          data: {
            companyId,
            itemId: rule.itemId,
            warehouseId: rule.warehouseId,
            alertType: "LOW_STOCK",
            severity: currentStock === 0 ? "CRITICAL" : "HIGH",
            currentStock,
            threshold: rule.minLevel,
            message: `${rule.item.itemFullName} is at critically low stock: ${currentStock} units`,
            status: "ACTIVE",
          },
        });
      }
      // Check for reorder point
      else if (currentStock <= rule.reorderPoint.toNumber()) {
        alerts.push({
          type: "REORDER_POINT",
          severity: "MEDIUM",
          itemId: rule.itemId,
          itemName: rule.item.itemFullName,
          message: `${rule.item.itemFullName} has reached reorder point`,
          currentStock,
          threshold: rule.reorderPoint.toNumber(),
          warehouseId: rule.warehouseId || undefined,
          warehouseName: rule.warehouse?.warehousename,
        });

        await prisma.stockAlert.create({
          data: {
            companyId,
            itemId: rule.itemId,
            warehouseId: rule.warehouseId,
            alertType: "REORDER_POINT",
            severity: "MEDIUM",
            currentStock,
            threshold: rule.reorderPoint,
            message: `${rule.item.itemFullName} has reached reorder point: ${currentStock} units`,
            status: "ACTIVE",
          },
        });

        // Auto-generate PO if enabled
        if (rule.autoReorder && rule.preferredSupplierId) {
          await this.autoGeneratePurchaseOrder(rule, companyId);
        }
      }
      // Check for overstock
      else if (currentStock >= rule.maxLevel.toNumber()) {
        alerts.push({
          type: "OVER_STOCK",
          severity: "LOW",
          itemId: rule.itemId,
          itemName: rule.item.itemFullName,
          message: `${rule.item.itemFullName} is overstocked`,
          currentStock,
          threshold: rule.maxLevel.toNumber(),
          warehouseId: rule.warehouseId || undefined,
          warehouseName: rule.warehouse?.warehousename,
        });

        await prisma.stockAlert.create({
          data: {
            companyId,
            itemId: rule.itemId,
            warehouseId: rule.warehouseId,
            alertType: "OVER_STOCK",
            severity: "LOW",
            currentStock,
            threshold: rule.maxLevel,
            message: `${rule.item.itemFullName} is overstocked: ${currentStock} units`,
            status: "ACTIVE",
          },
        });
      }
    }

    // Check for expiring items
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringReceipts = await prisma.stockReceipts.findMany({
      where: {
        companyId,
        expiryDate: {
          not: null,
          gt: now,
          lte: thirtyDaysFromNow,
        },
      },
      include: {
        item: true,
        warehouse: true,
        stocks: {
          where: { status: { in: ["AVAILABLE", "RESERVED"] } },
        },
      },
    });

    for (const receipt of expiringReceipts) {
      if (!receipt.expiryDate) continue;

      const daysUntilExpiry = Math.ceil(
        (receipt.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const severity =
        daysUntilExpiry <= 7
          ? "CRITICAL"
          : daysUntilExpiry <= 14
            ? "HIGH"
            : "MEDIUM";

      alerts.push({
        type: "EXPIRING_SOON",
        severity,
        itemId: receipt.itemId,
        itemName: receipt.item.itemFullName,
        message: `${receipt.item.itemFullName} expires in ${daysUntilExpiry} days`,
        currentStock: receipt.stocks.reduce(
          (sum, s) => sum + Number(s.quantityAvailable),
          0
        ),
        warehouseId: receipt.warehouseId || undefined,
        warehouseName: receipt.warehouse?.warehousename,
      });

      await prisma.stockAlert.create({
        data: {
          companyId,
          itemId: receipt.itemId,
          warehouseId: receipt.warehouseId,
          alertType: "EXPIRING_SOON",
          severity,
          message: `${receipt.item.itemFullName} expires in ${daysUntilExpiry} days`,
          expiryDate: receipt.expiryDate,
          status: "ACTIVE",
        },
      });
    }

    // Send notifications via Socket.IO if provided
    if (io && alerts.length > 0) {
      await NotificationHelper.sendToCompany(
        io,
        companyId,
        "Stock Alerts",
        `${alerts.length} stock alert(s) detected`,
        "warning",
        "/dashboard/inventory/alerts",
        "stock_alert",
        undefined,
        { alertCount: alerts.length }
      );
    }

    return {
      message: "Stock levels checked successfully",
      data: {
        totalAlerts: alerts.length,
        alerts,
      },
    };
  }

  /**
   * Get active alerts
   */
  public static async getActiveAlerts(
    req: Request,
    filters?: {
      alertType?: string;
      severity?: string;
      itemId?: string;
    },
    limit?: number,
    page?: number
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const where: any = { companyId, status: "ACTIVE" };
    if (filters?.alertType) where.alertType = filters.alertType;
    if (filters?.severity) where.severity = filters.severity;
    if (filters?.itemId) where.itemId = filters.itemId;

    const skip = page && limit ? (page - 1) * limit : 0;

    const [alerts, total] = await Promise.all([
      prisma.stockAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
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
        },
      }),
      prisma.stockAlert.count({ where }),
    ]);

    return {
      data: alerts,
      totalItems: total,
      currentPage: page || 1,
      itemsPerPage: limit || alerts.length,
      message: "Active alerts retrieved successfully",
    };
  }

  /**
   * Dismiss/acknowledge alert
   */
  public static async dismissAlert(req: Request, alertId: string) {
    const companyId = req.user?.company?.companyId;
    const userId = req.user?.id;

    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const alert = await prisma.stockAlert.findFirst({
      where: { id: alertId, companyId },
    });

    if (!alert) {
      throw new AppError("Alert not found", 404);
    }

    const updated = await prisma.stockAlert.update({
      where: { id: alertId },
      data: {
        status: "DISMISSED",
        dismissedBy: userId,
        dismissedAt: new Date(),
      },
    });

    return {
      message: "Alert dismissed successfully",
      data: updated,
    };
  }

  /**
   * Auto-generate purchase order when reorder point is reached
   */
  private static async autoGeneratePurchaseOrder(rule: any, companyId: string) {
    const { PONumberGenerator } = await import("../utils/PONumberGenerator ");

    const poNumber = await PONumberGenerator.generatePONumber(companyId);

    // Calculate delivery date based on lead time
    const expectedDeliveryDate = new Date();
    expectedDeliveryDate.setDate(
      expectedDeliveryDate.getDate() + (rule.leadTimeDays || 7)
    );

    await prisma.purchaseOrder.create({
      data: {
        poNumber,
        companyId,
        supplierId: rule.preferredSupplierId,
        notes: `Auto-generated PO: Stock below reorder point (${rule.reorderPoint})`,
        expectedDeliveryDate,
        items: {
          create: [
            {
              itemId: rule.itemId,
              quantity: rule.reorderQuantity,
            },
          ],
        },
      },
    });
  }
}
