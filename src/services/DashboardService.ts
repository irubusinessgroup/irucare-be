import { prisma } from "../utils/client";
import { IResponse } from "../utils/interfaces/common";
import AppError from "../utils/error";
import { PONumberGenerator } from "../utils/PONumberGenerator";
import type { Request } from "express";

type AuthRequest = Request & {
  user?: {
    id?: string;
    company?: { companyId?: string };
    branchId?: string | null;
  };
};
export class DashboardService {
  public static async getStockLogisticsStats(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;

      // Get total items count
      const totalItems = await prisma.items.count({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
      });

      // Get active shipments (deliveries with PENDING, IN_TRANSIT, DISPATCHED status)
      const activeShipments = await prisma.delivery.count({
        where: {
          OR: [{ supplierCompanyId: companyId }, { buyerCompanyId: companyId }],
          status: {
            in: ["PENDING", "IN_TRANSIT"],
          },
          // Note: deliveries might need branchId if they were updated to have it
          ...(branchId ? { branchId } : {}),
        },
      });

      // Get reorder alerts (items where current stock < minLevel)
      const reorderAlerts = await this.getReorderAlertsCount(
        companyId,
        branchId,
      );

      // Get efficiency (on-time deliveries percentage)
      const efficiency = await this.calculateDeliveryEfficiency(
        companyId,
        branchId,
      );

      // Get total value (sum of current stock * avg unit cost)
      const totalValue = await this.calculateTotalInventoryValue(
        companyId,
        branchId,
      );

      // Get low stock items count
      const lowStockItems = await this.getLowStockItemsCount(
        companyId,
        undefined,
        branchId,
      );

      // Get expiring items count (expiring within 30 days)
      const expiringItems = await this.getExpiringItemsCount(
        companyId,
        branchId,
      );

      // Get monthly growth percentage
      const monthlyGrowth = await this.calculateMonthlyGrowth(companyId);

      return {
        message: "Dashboard statistics retrieved successfully",
        statusCode: 200,
        data: {
          totalItems,
          activeShipments,
          reorderAlerts,
          efficiency,
          totalValue,
          lowStockItems,
          expiringItems,
          monthlyGrowth,
        },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getInventoryCategoriesSummary(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get categories with their items and stock information
      const categories = await prisma.itemCategories.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          items: {
            include: {
              stockReceipts: {
                where: {
                  ...(branchId ? { branchId } : {}),
                  OR: [
                    { approvals: { some: { approvalStatus: "APPROVED" } } },
                    { receiptType: "DIRECT_ADDITION" },
                  ],
                },
                include: {
                  stocks: true,
                },
              },
            },
          },
        },
      });

      const categoriesSummary = categories.map((category) => {
        let currentStock = 0;
        let totalValue = 0;
        let itemCount = 0;
        let totalCapacity = 0;
        let reorderThreshold = 0;

        category.items.forEach((item) => {
          // Calculate current stock for this item
          const itemStock = item.stockReceipts.reduce((total, receipt) => {
            return total + receipt.stocks.length;
          }, 0);

          currentStock += itemStock;
          itemCount++;

          // Calculate total capacity (maxLevel)
          totalCapacity += Number(item.maxLevel);

          // Calculate reorder threshold (minLevel)
          reorderThreshold += Number(item.minLevel);

          // Calculate total value (current stock * avg unit cost)
          let totalCost = 0;
          let totalQuantityForCost = 0;
          item.stockReceipts.forEach((receipt) => {
            totalCost += Number(receipt.totalCost);
            totalQuantityForCost += Number(receipt.quantityReceived);
          });
          const avgUnitCost =
            totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;
          totalValue += itemStock * avgUnitCost;
        });

        // Calculate status based on capacity utilization
        const capacityUtilization =
          totalCapacity > 0 ? currentStock / totalCapacity : 0;
        let status = "critical";
        if (capacityUtilization >= 0.7) status = "good";
        else if (capacityUtilization >= 0.4) status = "warning";

        return {
          categoryId: category.id,
          categoryName: category.categoryName,
          currentStock,
          totalCapacity,
          status,
          totalValue,
          itemCount,
          reorderThreshold: reorderThreshold / itemCount || 0,
        };
      });

      return {
        message: "Inventory categories summary retrieved successfully",
        statusCode: 200,
        data: categoriesSummary,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getReorderAlerts(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get items that need reordering
      const items = await prisma.items.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          category: true,
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
              ],
            },
            include: {
              stocks: true,
              supplier: true,
            },
          },
        },
      });

      const reorderAlerts: Array<{
        id: string;
        itemId: string;
        itemName: string;
        category: string;
        currentStock: number;
        reorderThreshold: number;
        supplier: string;
        lastOrderDate: Date | null;
        urgency: string;
      }> = [];

      for (const item of items) {
        // Calculate current stock
        const currentStock = item.stockReceipts.reduce((total, receipt) => {
          return total + receipt.stocks.length;
        }, 0);

        const minLevel = Number(item.minLevel);

        if (currentStock < minLevel) {
          // Get latest order date
          const latestReceipt = item.stockReceipts.reduce((latest, current) => {
            return new Date(current.dateReceived) >
              new Date(latest.dateReceived)
              ? current
              : latest;
          }, item.stockReceipts[0]);

          // Calculate urgency
          const stockRatio = minLevel > 0 ? currentStock / minLevel : 0;
          let urgency = "low";
          if (stockRatio < 0.1) urgency = "high";
          else if (stockRatio < 0.5) urgency = "medium";

          // Get primary supplier
          const suppliers = [
            ...new Set(item.stockReceipts.map((r) => r.supplier?.supplierName)),
          ];
          const supplier = suppliers[0] || "Unknown";

          reorderAlerts.push({
            id: `alert-${item.id}`,
            itemId: item.id,
            itemName: item.itemFullName,
            category: item.category.categoryName,
            currentStock,
            reorderThreshold: minLevel,
            supplier,
            lastOrderDate: latestReceipt?.dateReceived || null,
            urgency,
          });
        }
      }

      // Sort by urgency (high first) then by current stock (lowest first)
      reorderAlerts.sort((a, b) => {
        const urgencyOrder: { [key: string]: number } = {
          high: 3,
          medium: 2,
          low: 1,
        };
        if (urgencyOrder[a.urgency] !== urgencyOrder[b.urgency]) {
          return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
        }
        return a.currentStock - b.currentStock;
      });

      return {
        message: "Reorder alerts retrieved successfully",
        statusCode: 200,
        data: reorderAlerts,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getRecentShipments(
    req: AuthRequest,
    limit: number = 10,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get recent deliveries
      const deliveries = await prisma.delivery.findMany({
        where: {
          OR: [{ supplierCompanyId: companyId }, { buyerCompanyId: companyId }],
          ...(branchId ? { branchId } : {}),
        },
        include: {
          deliveryItems: {
            include: {
              item: {
                include: { category: true },
              },
            },
          },
          supplierCompany: true,
          buyerCompany: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const recentShipments = deliveries.map((delivery) => {
        // Calculate total units
        const totalUnits = delivery.deliveryItems.reduce((total, item) => {
          return total + Number(item.quantityToDeliver);
        }, 0);

        // Get primary category from delivery items
        const categories = [
          ...new Set(
            delivery.deliveryItems.map(
              (item) => item.item?.category?.categoryName,
            ),
          ),
        ];
        const category = categories[0] || "Mixed";

        // Determine direction
        const direction =
          delivery.supplierCompanyId === companyId ? "outgoing" : "incoming";

        // Calculate time remaining
        const now = new Date();
        const plannedDate = new Date(delivery.plannedDeliveryDate);
        const timeDiff = plannedDate.getTime() - now.getTime();
        const hoursRemaining = Math.ceil(timeDiff / (1000 * 60 * 60));

        let timeRemaining = "Overdue";
        if (hoursRemaining > 24) {
          timeRemaining = `${Math.ceil(hoursRemaining / 24)} days`;
        } else if (hoursRemaining > 0) {
          timeRemaining = `${hoursRemaining} hours`;
        }

        // Map delivery status to shipment status
        let status = delivery.status.toLowerCase();
        if (status === "pending") status = "pending";
        else if (status === "in_transit") status = "in-transit";
        else if (status === "delivered") status = "delivered";
        else if (status === "partially_delivered")
          status = "partially-delivered";
        else if (status === "cancelled") status = "cancelled";

        return {
          id: delivery.id,
          shipmentId: delivery.deliveryNumber,
          category,
          direction,
          units: totalUnits,
          status,
          timeRemaining,
          companyName:
            direction === "incoming"
              ? delivery.supplierCompany.name
              : delivery.buyerCompany.name,
          deliveryDate: delivery.plannedDeliveryDate,
        };
      });

      return {
        message: "Recent shipments retrieved successfully",
        statusCode: 200,
        data: recentShipments,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getInventoryTrends(
    req: AuthRequest,
    months: number = 6,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const trends: unknown[] = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const endDate = new Date(
          now.getFullYear(),
          now.getMonth() - i + 1,
          0,
          23,
          59,
          59,
        );

        const monthName = startDate.toLocaleDateString("en-US", {
          month: "short",
        });
        const year = startDate.getFullYear();

        // Get total stock for this month
        const items = await prisma.items.findMany({
          where: {
            companyId,
            ...(branchId ? { branchId } : {}),
            createdAt: { lte: endDate },
          },
          include: {
            stockReceipts: {
              where: {
                dateReceived: { lte: endDate },
                OR: [
                  { approvals: { some: { approvalStatus: "APPROVED" } } },
                  { receiptType: "DIRECT_ADDITION" },
                ],
              },
              include: { stocks: true },
            },
          },
        });

        let totalStock = 0;
        let totalValue = 0;

        items.forEach((item) => {
          const itemStock = item.stockReceipts.reduce((total, receipt) => {
            return total + receipt.stocks.length;
          }, 0);
          totalStock += itemStock;

          // Calculate value
          let totalCost = 0;
          let totalQuantityForCost = 0;
          item.stockReceipts.forEach((receipt) => {
            totalCost += Number(receipt.totalCost);
            totalQuantityForCost += Number(receipt.quantityReceived);
          });
          const avgUnitCost =
            totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;
          totalValue += itemStock * avgUnitCost;
        });

        // Get incoming shipments (deliveries received)
        const incomingShipments = await prisma.delivery.count({
          where: {
            buyerCompanyId: companyId,
            ...(branchId ? { branchId } : {}),
            status: "DELIVERED",
            actualDeliveryDate: {
              gte: startDate,
              lte: endDate,
            },
          },
        });

        // Get outgoing shipments (deliveries sent)
        const outgoingShipments = await prisma.delivery.count({
          where: {
            supplierCompanyId: companyId,
            ...(branchId ? { branchId } : {}),
            status: "DELIVERED",
            actualDeliveryDate: {
              gte: startDate,
              lte: endDate,
            },
          },
        });

        // Get low stock alerts for this month
        const lowStockAlerts = await this.getLowStockItemsCount(
          companyId,
          endDate,
          branchId,
        );

        trends.push({
          month: monthName,
          year,
          totalStock,
          totalValue,
          incomingShipments,
          outgoingShipments,
          lowStockAlerts,
        });
      }

      return {
        message: "Inventory trends retrieved successfully",
        statusCode: 200,
        data: trends,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  // Helper methods
  private static async getReorderAlertsCount(
    companyId: string,
    branchId?: string | null,
  ): Promise<number> {
    const items = await prisma.items.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      include: {
        stockReceipts: {
          where: {
            ...(branchId ? { branchId } : {}),
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
            ],
          },
          include: { stocks: true },
        },
      },
    });

    let count = 0;
    for (const item of items) {
      const currentStock = item.stockReceipts.reduce((total, receipt) => {
        return total + receipt.stocks.length;
      }, 0);
      if (currentStock < Number(item.minLevel)) {
        count++;
      }
    }
    return count;
  }

  private static async calculateDeliveryEfficiency(
    companyId: string,
    branchId?: string | null,
  ): Promise<number> {
    const deliveries = await prisma.delivery.findMany({
      where: {
        OR: [{ supplierCompanyId: companyId }, { buyerCompanyId: companyId }],
        ...(branchId ? { branchId } : {}),
        status: "DELIVERED",
      },
      select: {
        plannedDeliveryDate: true,
        actualDeliveryDate: true,
      },
    });

    if (deliveries.length === 0) return 0;

    const onTimeDeliveries = deliveries.filter((delivery) => {
      if (!delivery.actualDeliveryDate) return false;
      return (
        new Date(delivery.actualDeliveryDate) <=
        new Date(delivery.plannedDeliveryDate)
      );
    });

    return Number(
      ((onTimeDeliveries.length / deliveries.length) * 100).toFixed(1),
    );
  }

  private static async calculateTotalInventoryValue(
    companyId: string,
    branchId?: string | null,
  ): Promise<number> {
    const items = await prisma.items.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      include: {
        stockReceipts: {
          where: {
            ...(branchId ? { branchId } : {}),
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
            ],
          },
          include: { stocks: true },
        },
      },
    });

    let totalValue = 0;
    for (const item of items) {
      const currentStock = item.stockReceipts.reduce((total, receipt) => {
        return total + receipt.stocks.length;
      }, 0);

      let totalCost = 0;
      let totalQuantityForCost = 0;
      item.stockReceipts.forEach((receipt) => {
        totalCost += Number(receipt.totalCost);
        totalQuantityForCost += Number(receipt.quantityReceived);
      });
      const avgUnitCost =
        totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;
      totalValue += currentStock * avgUnitCost;
    }

    return totalValue;
  }

  private static async getLowStockItemsCount(
    companyId: string,
    beforeDate?: Date,
    branchId?: string | null,
  ): Promise<number> {
    const items = await prisma.items.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        ...(beforeDate && { createdAt: { lte: beforeDate } }),
      },
      include: {
        stockReceipts: {
          where: {
            ...(branchId ? { branchId } : {}),
            ...(beforeDate && { dateReceived: { lte: beforeDate } }),
            OR: [
              { approvals: { some: { approvalStatus: "APPROVED" } } },
              { receiptType: "DIRECT_ADDITION" },
            ],
          },
          include: { stocks: true },
        },
      },
    });

    let count = 0;
    for (const item of items) {
      const currentStock = item.stockReceipts.reduce((total, receipt) => {
        return total + receipt.stocks.length;
      }, 0);
      if (currentStock <= Number(item.minLevel)) {
        count++;
      }
    }
    return count;
  }

  private static async getExpiringItemsCount(
    companyId: string,
    branchId?: string | null,
  ): Promise<number> {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const stockReceipts = await prisma.stockReceipts.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        expiryDate: {
          lte: thirtyDaysFromNow,
          gte: new Date(),
        },
        OR: [
          { approvals: { some: { approvalStatus: "APPROVED" } } },
          { receiptType: "DIRECT_ADDITION" },
        ],
      },
      include: { stocks: true },
    });

    // Count unique items that have expiring stock
    const expiringItemIds = new Set();
    stockReceipts.forEach((receipt) => {
      if (receipt.stocks.length > 0) {
        expiringItemIds.add(receipt.itemId);
      }
    });

    return expiringItemIds.size;
  }

  private static async calculateMonthlyGrowth(
    companyId: string,
  ): Promise<number> {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const currentMonthItems = await prisma.items.count({
      where: {
        companyId,
        createdAt: { gte: currentMonth },
      },
    });

    const lastMonthItems = await prisma.items.count({
      where: {
        companyId,
        createdAt: {
          gte: lastMonth,
          lt: currentMonth,
        },
      },
    });

    if (lastMonthItems === 0) return currentMonthItems > 0 ? 100 : 0;

    return Number(
      (((currentMonthItems - lastMonthItems) / lastMonthItems) * 100).toFixed(
        1,
      ),
    );
  }

  // Inventory Dashboard APIs
  public static async getCategoryPerformance(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const categories = await prisma.itemCategories.findMany({
        where: { companyId },
        include: {
          items: {
            include: {
              stockReceipts: {
                where: {
                  OR: [
                    { approvals: { some: { approvalStatus: "APPROVED" } } },
                    { receiptType: "DIRECT_ADDITION" },
                  ],
                },
                include: { stocks: true },
              },
            },
          },
        },
      });

      const categoryPerformance = categories.map((category) => {
        let current = 0;
        let capacity = 0;
        let value = 0;
        let itemCount = 0;
        let reorderThreshold = 0;

        category.items.forEach((item) => {
          const itemStock = item.stockReceipts.reduce((total, receipt) => {
            return total + receipt.stocks.length;
          }, 0);

          current += itemStock;
          capacity += Number(item.maxLevel);
          itemCount++;

          // Calculate value
          let totalCost = 0;
          let totalQuantityForCost = 0;
          item.stockReceipts.forEach((receipt) => {
            totalCost += Number(receipt.totalCost);
            totalQuantityForCost += Number(receipt.quantityReceived);
          });
          const avgUnitCost =
            totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;
          value += itemStock * avgUnitCost;

          reorderThreshold += Number(item.minLevel);
        });

        // Calculate trend (simplified - comparing with previous month)
        const trend = "+12%"; // This would need historical data calculation

        return {
          categoryId: category.id,
          categoryName: category.categoryName,
          current,
          capacity,
          value,
          trend,
          itemCount,
          reorderThreshold: reorderThreshold / itemCount || 0,
        };
      });

      return {
        message: "Category performance retrieved successfully",
        statusCode: 200,
        data: categoryPerformance,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getInventoryAgingAnalysis(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const stockReceipts = await prisma.stockReceipts.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          OR: [
            { approvals: { some: { approvalStatus: "APPROVED" } } },
            { receiptType: "DIRECT_ADDITION" },
          ],
        },
        include: { stocks: true },
      });

      const now = new Date();
      const agingBuckets = [
        { bucket: "0-30 days", days: 30, color: "bg-green-500" },
        { bucket: "31-60 days", days: 60, color: "bg-yellow-500" },
        { bucket: "61-90 days", days: 90, color: "bg-orange-500" },
        { bucket: "> 90 days", days: Infinity, color: "bg-red-500" },
      ];

      const agingData = agingBuckets.map((bucket) => {
        const items = stockReceipts.filter((receipt) => {
          const daysDiff = Math.floor(
            (now.getTime() - receipt.dateReceived.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (bucket.days === Infinity) {
            return daysDiff > 90;
          }
          return daysDiff <= bucket.days && daysDiff > bucket.days - 30;
        });

        const itemCount = items.reduce((total, receipt) => {
          return total + receipt.stocks.length;
        }, 0);

        const totalItems = stockReceipts.reduce((total, receipt) => {
          return total + receipt.stocks.length;
        }, 0);

        const percentage = totalItems > 0 ? (itemCount / totalItems) * 100 : 0;

        const value = items.reduce((total, receipt) => {
          return total + Number(receipt.totalCost);
        }, 0);

        return {
          bucket: bucket.bucket,
          items: itemCount,
          percentage: Math.round(percentage),
          color: bucket.color,
          value,
        };
      });

      return {
        message: "Inventory aging analysis retrieved successfully",
        statusCode: 200,
        data: agingData,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getLowStockItems(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const items = await prisma.items.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          category: true,
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
              ],
            },
            include: {
              stocks: true,
              supplier: true,
            },
          },
        },
      });

      const lowStockItems: Array<{
        id: string;
        sku: string;
        name: string;
        current: number;
        min: number;
        supplier: string;
        lastOrder: Date | null;
        leadTime: string;
        category: string;
        unitCost: number;
        urgency: string;
        daysOutOfStock: number;
        salesVelocity: string;
      }> = [];

      for (const item of items) {
        const currentStock = item.stockReceipts.reduce((total, receipt) => {
          return total + receipt.stocks.length;
        }, 0);

        const minLevel = Number(item.minLevel);

        if (currentStock < minLevel) {
          // Get latest receipt
          const latestReceipt = item.stockReceipts.reduce((latest, current) => {
            return new Date(current.dateReceived) >
              new Date(latest.dateReceived)
              ? current
              : latest;
          }, item.stockReceipts[0]);

          // Calculate urgency
          const stockRatio = minLevel > 0 ? currentStock / minLevel : 0;
          let urgency = "low";
          if (stockRatio < 0.2) urgency = "high";
          else if (stockRatio < 0.5) urgency = "medium";

          // Calculate days out of stock
          const daysOutOfStock = latestReceipt
            ? Math.max(
                0,
                Math.floor(
                  (new Date().getTime() -
                    latestReceipt.dateReceived.getTime()) /
                    (1000 * 60 * 60 * 24),
                ),
              )
            : 0;

          // Get supplier info
          const suppliers = [
            ...new Set(item.stockReceipts.map((r) => r.supplier?.supplierName)),
          ];
          const supplier = suppliers[0] || "Unknown";

          // Calculate unit cost
          let totalCost = 0;
          let totalQuantityForCost = 0;
          item.stockReceipts.forEach((receipt) => {
            totalCost += Number(receipt.totalCost);
            totalQuantityForCost += Number(receipt.quantityReceived);
          });
          const unitCost =
            totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;

          lowStockItems.push({
            id: item.id,
            sku: item.itemCodeSku,
            name: item.itemFullName,
            current: currentStock,
            min: minLevel,
            supplier,
            lastOrder: latestReceipt?.dateReceived || null,
            leadTime: "5-7 days", // This would come from supplier data
            category: item.category.categoryName,
            unitCost,
            urgency,
            daysOutOfStock,
            salesVelocity: "12 units/week", // This would need sales data calculation
          });
        }
      }

      // Sort by urgency
      lowStockItems.sort((a, b) => {
        const urgencyOrder: Record<string, number> = {
          high: 3,
          medium: 2,
          low: 1,
        };
        return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      });

      return {
        message: "Low stock items retrieved successfully",
        statusCode: 200,
        data: lowStockItems,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getTopPerformers(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const categories = await prisma.itemCategories.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          items: {
            include: {
              stockReceipts: {
                where: {
                  ...(branchId ? { branchId } : {}),
                  OR: [
                    { approvals: { some: { approvalStatus: "APPROVED" } } },
                    { receiptType: "DIRECT_ADDITION" },
                  ],
                },
                include: { stocks: true },
              },
            },
          },
        },
      });

      const topPerformers = categories.map((category) => {
        let revenue = 0;
        let units = 0;

        category.items.forEach((item) => {
          const itemStock = item.stockReceipts.reduce((total, receipt) => {
            return total + receipt.stocks.length;
          }, 0);

          units += itemStock;

          // Calculate revenue (simplified - using stock value as revenue)
          let totalCost = 0;
          let totalQuantityForCost = 0;
          item.stockReceipts.forEach((receipt) => {
            totalCost += Number(receipt.totalCost);
            totalQuantityForCost += Number(receipt.quantityReceived);
          });
          const avgUnitCost =
            totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;
          revenue += itemStock * avgUnitCost;
        });

        return {
          categoryId: category.id,
          categoryName: category.categoryName,
          revenue,
          growth: "+12%", // This would need historical data
          units,
          profitMargin: 25.5, // This would need sales vs cost data
        };
      });

      // Sort by revenue
      topPerformers.sort((a, b) => b.revenue - a.revenue);

      return {
        message: "Top performers retrieved successfully",
        statusCode: 200,
        data: topPerformers,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getWarehouseUtilization(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get storage locations from stock receipts
      const stockReceipts = await prisma.stockReceipts.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          OR: [
            { approvals: { some: { approvalStatus: "APPROVED" } } },
            { receiptType: "DIRECT_ADDITION" },
          ],
        },
        include: { stocks: true, warehouse: true },
      });

      // Group by storage location
      const locationMap = new Map();
      stockReceipts.forEach((receipt) => {
        const location =
          receipt.warehouse?.warehousename || "Default Warehouse";
        if (!locationMap.has(location)) {
          locationMap.set(location, {
            used: 0,
            items: 0,
            receipts: new Set(),
          });
        }
        const locationData = locationMap.get(location);
        locationData.used += receipt.stocks.length;
        locationData.items++;
        locationData.receipts.add(receipt.id);
      });

      const warehouseUtilization = Array.from(locationMap.entries()).map(
        ([location, data]) => {
          // Assume total capacity (this would come from warehouse configuration)
          const total = data.used * 1.5; // Simplified calculation
          const percentage = Math.round((data.used / total) * 100);

          return {
            locationId: `wh-${location.toLowerCase().replace(/\s+/g, "-")}`,
            location,
            used: data.used,
            total,
            percentage,
            capacity: "m²",
            items: data.items,
          };
        },
      );

      return {
        message: "Warehouse utilization retrieved successfully",
        statusCode: 200,
        data: warehouseUtilization,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  // Reorder Alerts APIs
  public static async getCriticalItems(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const items = await prisma.items.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          category: true,
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
              ],
            },
            include: {
              stocks: true,
              supplier: true,
            },
          },
        },
      });

      const criticalItems: Array<{
        id: string;
        sku: string;
        name: string;
        current: number;
        min: number;
        supplier: string;
        contactPerson: string;
        phone: string;
        email: string;
        leadTime: string;
        lastOrderDate: Date | null;
        avgOrderQty: number;
        unitCost: number;
        category: string;
        daysOutOfStock: number;
        salesVelocity: string;
        urgency: string;
      }> = [];

      for (const item of items) {
        const currentStock = item.stockReceipts.reduce((total, receipt) => {
          return total + receipt.stocks.length;
        }, 0);

        const minLevel = Number(item.minLevel);
        const stockRatio = minLevel > 0 ? currentStock / minLevel : 0;

        // Only include critical items (stock ratio < 0.2)
        if (currentStock < minLevel && stockRatio < 0.2) {
          const latestReceipt = item.stockReceipts.reduce((latest, current) => {
            return new Date(current.dateReceived) >
              new Date(latest.dateReceived)
              ? current
              : latest;
          }, item.stockReceipts[0]);

          const supplier = item.stockReceipts[0]?.supplier;
          const daysOutOfStock = latestReceipt
            ? Math.max(
                0,
                Math.floor(
                  (new Date().getTime() -
                    latestReceipt.dateReceived.getTime()) /
                    (1000 * 60 * 60 * 24),
                ),
              )
            : 0;

          // Calculate unit cost
          let totalCost = 0;
          let totalQuantityForCost = 0;
          item.stockReceipts.forEach((receipt) => {
            totalCost += Number(receipt.totalCost);
            totalQuantityForCost += Number(receipt.quantityReceived);
          });
          const unitCost =
            totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;

          // Calculate average order quantity
          const avgOrderQty =
            item.stockReceipts.length > 0
              ? item.stockReceipts.reduce(
                  (sum, receipt) => sum + Number(receipt.quantityReceived),
                  0,
                ) / item.stockReceipts.length
              : 0;

          criticalItems.push({
            id: item.id,
            sku: item.itemCodeSku,
            name: item.itemFullName,
            current: currentStock,
            min: minLevel,
            supplier: supplier?.supplierName || "Unknown",
            contactPerson: supplier?.contactPerson || "N/A",
            phone: supplier?.phoneNumber || "N/A",
            email: supplier?.email || "N/A",
            leadTime: "3-5 days", // This would come from supplier data
            lastOrderDate: latestReceipt?.dateReceived || null,
            avgOrderQty: Math.round(avgOrderQty),
            unitCost,
            category: item.category.categoryName,
            daysOutOfStock,
            salesVelocity: "12 units/week", // This would need sales data calculation
            urgency: "high",
          });
        }
      }

      // Sort by urgency and current stock
      criticalItems.sort((a, b) => a.current - b.current);

      return {
        message: "Critical items retrieved successfully",
        statusCode: 200,
        data: criticalItems,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getWarningItems(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const items = await prisma.items.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          category: true,
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
              ],
            },
            include: {
              stocks: true,
              supplier: true,
            },
          },
        },
      });

      const warningItems: Array<{
        id: string;
        sku: string;
        name: string;
        current: number;
        min: number;
        supplier: string;
        contactPerson: string;
        phone: string;
        email: string;
        leadTime: string;
        lastOrderDate: Date | null;
        avgOrderQty: number;
        unitCost: number;
        category: string;
        daysOutOfStock: number;
        salesVelocity: string;
        urgency: string;
      }> = [];

      for (const item of items) {
        const currentStock = item.stockReceipts.reduce((total, receipt) => {
          return total + receipt.stocks.length;
        }, 0);

        const minLevel = Number(item.minLevel);
        const stockRatio = minLevel > 0 ? currentStock / minLevel : 0;

        // Only include warning items (0.2 <= stock ratio < 0.5)
        if (currentStock < minLevel && stockRatio >= 0.2 && stockRatio < 0.5) {
          const latestReceipt = item.stockReceipts.reduce((latest, current) => {
            return new Date(current.dateReceived) >
              new Date(latest.dateReceived)
              ? current
              : latest;
          }, item.stockReceipts[0]);

          const supplier = item.stockReceipts[0]?.supplier;
          const daysOutOfStock = latestReceipt
            ? Math.max(
                0,
                Math.floor(
                  (new Date().getTime() -
                    latestReceipt.dateReceived.getTime()) /
                    (1000 * 60 * 60 * 24),
                ),
              )
            : 0;

          // Calculate unit cost
          let totalCost = 0;
          let totalQuantityForCost = 0;
          item.stockReceipts.forEach((receipt) => {
            totalCost += Number(receipt.totalCost);
            totalQuantityForCost += Number(receipt.quantityReceived);
          });
          const unitCost =
            totalQuantityForCost > 0 ? totalCost / totalQuantityForCost : 0;

          // Calculate average order quantity
          const avgOrderQty =
            item.stockReceipts.length > 0
              ? item.stockReceipts.reduce(
                  (sum, receipt) => sum + Number(receipt.quantityReceived),
                  0,
                ) / item.stockReceipts.length
              : 0;

          warningItems.push({
            id: item.id,
            sku: item.itemCodeSku,
            name: item.itemFullName,
            current: currentStock,
            min: minLevel,
            supplier: supplier?.supplierName || "Unknown",
            contactPerson: supplier?.contactPerson || "N/A",
            phone: supplier?.phoneNumber || "N/A",
            email: supplier?.email || "N/A",
            leadTime: "10-14 days", // This would come from supplier data
            lastOrderDate: latestReceipt?.dateReceived || null,
            avgOrderQty: Math.round(avgOrderQty),
            unitCost,
            category: item.category.categoryName,
            daysOutOfStock,
            salesVelocity: "8 units/week", // This would need sales data calculation
            urgency: "medium",
          });
        }
      }

      // Sort by current stock
      warningItems.sort((a, b) => a.current - b.current);

      return {
        message: "Warning items retrieved successfully",
        statusCode: 200,
        data: warningItems,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getSupplierSummary(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;

      // Get suppliers with their items that need reordering
      const suppliers = await prisma.suppliers.findMany({
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
        },
        include: {
          stockReceipts: {
            where: {
              ...(branchId ? { branchId } : {}),
              OR: [
                { approvals: { some: { approvalStatus: "APPROVED" } } },
                { receiptType: "DIRECT_ADDITION" },
              ],
            },
            include: {
              stocks: true,
              item: {
                include: { category: true },
              },
            },
          },
        },
      });

      const supplierSummary: Array<{
        id: string;
        name: string;
        itemsAffected: number;
        totalValue: number;
        avgLeadTime: string;
        status: string;
        onTimeDelivery: number;
        rating: number;
        contactPerson: string;
        phone: string;
        email: string;
      }> = [];

      for (const supplier of suppliers) {
        // Get items that need reordering for this supplier
        const itemsNeedingReorder: Array<{
          item: {
            id: string;
            minLevel: number;
          };
          currentStock: number;
          minLevel: number;
        }> = [];
        const itemMap = new Map();

        supplier.stockReceipts.forEach((receipt) => {
          if (!itemMap.has(receipt.itemId)) {
            itemMap.set(receipt.itemId, {
              item: receipt.item,
              currentStock: 0,
              minLevel: Number(receipt.item.minLevel),
            });
          }
          const itemData = itemMap.get(receipt.itemId);
          itemData.currentStock += receipt.stocks.length;
        });

        itemMap.forEach((itemData) => {
          if (itemData.currentStock < itemData.minLevel) {
            itemsNeedingReorder.push(itemData);
          }
        });

        if (itemsNeedingReorder.length > 0) {
          // Calculate total value
          const totalValue = itemsNeedingReorder.reduce((total, itemData) => {
            const item = itemData.item;
            const receipts = supplier.stockReceipts.filter(
              (r) => r.itemId === item.id,
            );
            let itemValue = 0;
            receipts.forEach((receipt) => {
              itemValue += Number(receipt.totalCost);
            });
            return total + itemValue;
          }, 0);

          // Calculate on-time delivery (simplified)
          const onTimeDelivery = 95; // This would need delivery tracking data

          // Determine status based on performance
          let status = "reliable";
          if (onTimeDelivery < 80) status = "unreliable";
          else if (onTimeDelivery < 90) status = "moderate";

          supplierSummary.push({
            id: supplier.id,
            name: supplier.supplierName,
            itemsAffected: itemsNeedingReorder.length,
            totalValue,
            avgLeadTime: "7-10 days", // This would come from supplier data
            status,
            onTimeDelivery,
            rating: 4.8, // This would need rating system
            contactPerson: supplier.contactPerson,
            phone: supplier.phoneNumber,
            email: supplier.email,
          });
        }
      }

      // Sort by items affected (descending)
      supplierSummary.sort((a, b) => b.itemsAffected - a.itemsAffected);

      return {
        message: "Supplier summary retrieved successfully",
        statusCode: 200,
        data: supplierSummary,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async createReorderRequest(
    data: {
      itemId: string;
      quantity: number;
      supplierId: string;
      priority: string;
    },
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Validate item exists and belongs to company/branch
      const item = await prisma.items.findFirst({
        where: {
          id: data.itemId,
          companyId,
          ...(branchId ? { branchId } : {}),
        },
      });

      if (!item) {
        throw new AppError("Item not found", 404);
      }

      // Validate supplier exists and belongs to company/branch
      const supplier = await prisma.suppliers.findFirst({
        where: {
          id: data.supplierId,
          companyId,
          ...(branchId ? { branchId } : {}),
        },
      });

      if (!supplier) {
        throw new AppError("Supplier not found", 404);
      }

      // Create a purchase order for the reorder request
      const poNumber = await PONumberGenerator.generatePONumber(companyId);

      const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
          poNumber,
          companyId,
          branchId: branchId as any,
          supplierId: data.supplierId,
          expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          notes: `Reorder request for ${item.itemFullName} - Priority: ${data.priority}`,
          overallStatus: "NOT_YET",
        },
      });

      // Create purchase order item
      await prisma.purchaseOrderItem.create({
        data: {
          purchaseOrderId: purchaseOrder.id,
          itemId: data.itemId,
          quantity: data.quantity,
          itemStatus: "NOT_ACTED",
        },
      });

      return {
        message: "Reorder request created successfully",
        statusCode: 200,
        data: {
          success: true,
          purchaseOrderId: purchaseOrder.id,
          poNumber,
        },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
  // Shipments Dashboard APIs
  public static async getIncomingShipments(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const deliveries = await prisma.delivery.findMany({
        where: {
          buyerCompanyId: companyId,
          ...(branchId ? { branchId: branchId } : {}),
        },
        include: {
          deliveryItems: {
            include: {
              item: {
                include: { category: true },
              },
            },
          },
          supplierCompany: true,
          buyerCompany: true,
        },
        orderBy: { plannedDeliveryDate: "asc" },
      });

      const incomingShipments = deliveries.map((delivery) => {
        // Calculate total units
        const totalUnits = delivery.deliveryItems.reduce((total, item) => {
          return total + Number(item.quantityToDeliver);
        }, 0);

        // Get primary category
        const categories = [
          ...new Set(
            delivery.deliveryItems.map(
              (item) => item.item?.category?.categoryName,
            ),
          ),
        ];
        const category = categories[0] || "Mixed";

        // Calculate ETA
        const now = new Date();
        const plannedDate = new Date(delivery.plannedDeliveryDate);
        const timeDiff = plannedDate.getTime() - now.getTime();
        const hoursRemaining = Math.ceil(timeDiff / (1000 * 60 * 60));

        let eta = "Delivered";
        if (delivery.status === "DELIVERED") {
          eta = "Delivered";
        } else if (timeDiff < 0) {
          eta = "Overdue";
        } else if (hoursRemaining <= 2) {
          eta = `${hoursRemaining}h`;
        } else if (hoursRemaining <= 24) {
          eta = `${Math.ceil(hoursRemaining / 24)}d`;
        } else {
          eta = plannedDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        }

        // Map delivery status
        let status = delivery.status.toLowerCase();
        if (status === "pending") status = "pending";
        else if (status === "in_transit") status = "in-transit";
        else if (status === "delivered") status = "delivered";
        else if (status === "partially_delivered")
          status = "partially-delivered";
        else if (status === "cancelled") status = "cancelled";

        // Calculate progress
        let progress = 25;
        if (status === "delivered") progress = 100;
        else if (status === "in-transit") progress = 75;
        else if (status === "partially-delivered") progress = 50;

        // Calculate value
        const value = delivery.deliveryItems.reduce((total, item) => {
          return (
            total +
            Number(item.actualUnitPrice || 0) * Number(item.quantityToDeliver)
          );
        }, 0);

        // Calculate weight (simplified)
        const weight = `${(totalUnits * 0.5).toFixed(1)} tons`;

        // Determine priority
        let priority = "low";
        if (timeDiff < 0) priority = "high";
        else if (hoursRemaining <= 24) priority = "high";
        else if (hoursRemaining <= 72) priority = "medium";

        return {
          id: delivery.id,
          shipmentId: delivery.deliveryNumber,
          category,
          units: totalUnits,
          eta,
          status,
          origin: delivery.supplierCompany.name,
          destination: delivery.buyerCompany.name,
          carrier: delivery.courierService || "Unknown",
          trackingNumber: delivery.trackingNumber || "N/A",
          value,
          weight,
          driver: delivery.driverName || "N/A",
          driverPhone: delivery.driverPhone || "N/A",
          progress,
          currentLocation: "In Transit", // This would come from tracking data
          estimatedCost: Number(delivery.deliveryCharges || 0),
          priority,
          route: `${delivery.supplierCompany.name} → ${delivery.buyerCompany.name}`,
          direction: "incoming",
        };
      });

      return {
        message: "Incoming shipments retrieved successfully",
        statusCode: 200,
        data: incomingShipments,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getOutgoingShipments(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      const deliveries = await prisma.delivery.findMany({
        where: {
          supplierCompanyId: companyId,
          ...(branchId ? { branchId: branchId } : {}),
        },
        include: {
          deliveryItems: {
            include: {
              item: {
                include: { category: true },
              },
            },
          },
          supplierCompany: true,
          buyerCompany: true,
        },
        orderBy: { plannedDeliveryDate: "asc" },
      });

      const outgoingShipments = deliveries.map((delivery) => {
        // Calculate total units
        const totalUnits = delivery.deliveryItems.reduce((total, item) => {
          return total + Number(item.quantityToDeliver);
        }, 0);

        // Get primary category
        const categories = [
          ...new Set(
            delivery.deliveryItems.map(
              (item) => item.item?.category?.categoryName,
            ),
          ),
        ];
        const category = categories[0] || "Mixed";

        // Calculate ETA
        const now = new Date();
        const plannedDate = new Date(delivery.plannedDeliveryDate);
        const timeDiff = plannedDate.getTime() - now.getTime();
        const hoursRemaining = Math.ceil(timeDiff / (1000 * 60 * 60));

        let eta = "Delivered";
        if (delivery.status === "DELIVERED") {
          eta = "Delivered";
        } else if (timeDiff < 0) {
          eta = "Overdue";
        } else if (hoursRemaining <= 2) {
          eta = `${hoursRemaining}h`;
        } else if (hoursRemaining <= 24) {
          eta = `${Math.ceil(hoursRemaining / 24)}d`;
        } else {
          eta = plannedDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        }

        // Map delivery status
        let status = delivery.status.toLowerCase();
        if (status === "pending") status = "pending";
        else if (status === "in_transit") status = "in-transit";
        else if (status === "delivered") status = "delivered";
        else if (status === "partially_delivered")
          status = "partially-delivered";
        else if (status === "cancelled") status = "cancelled";

        // Calculate progress
        let progress = 25;
        if (status === "delivered") progress = 100;
        else if (status === "in-transit") progress = 75;
        else if (status === "partially-delivered") progress = 50;

        // Calculate value
        const value = delivery.deliveryItems.reduce((total, item) => {
          return (
            total +
            Number(item.actualUnitPrice || 0) * Number(item.quantityToDeliver)
          );
        }, 0);

        // Calculate weight (simplified)
        const weight = `${(totalUnits * 0.5).toFixed(1)} tons`;

        // Determine priority
        let priority = "low";
        if (timeDiff < 0) priority = "high";
        else if (hoursRemaining <= 24) priority = "high";
        else if (hoursRemaining <= 72) priority = "medium";

        // Calculate delivered time
        let deliveredTime = null;
        if (delivery.actualDeliveryDate) {
          const deliveredDate = new Date(delivery.actualDeliveryDate);
          const now = new Date();
          const diffHours = Math.floor(
            (now.getTime() - deliveredDate.getTime()) / (1000 * 60 * 60),
          );

          if (diffHours < 24) {
            deliveredTime = `${diffHours} hours ago`;
          } else {
            deliveredTime = deliveredDate.toLocaleDateString("en-US", {
              weekday: "long",
              hour: "numeric",
              minute: "2-digit",
            });
          }
        }

        return {
          id: delivery.id,
          shipmentId: delivery.deliveryNumber,
          category,
          units: totalUnits,
          eta,
          status,
          origin: delivery.supplierCompany.name,
          destination: delivery.buyerCompany.name,
          carrier: delivery.courierService || "Unknown",
          trackingNumber: delivery.trackingNumber || "N/A",
          value,
          weight,
          driver: delivery.driverName || "N/A",
          driverPhone: delivery.driverPhone || "N/A",
          progress,
          currentLocation:
            delivery.status === "DELIVERED"
              ? delivery.buyerCompany.name
              : "In Transit",
          estimatedCost: Number(delivery.deliveryCharges || 0),
          priority: delivery.status === "DELIVERED" ? "completed" : priority,
          deliveredTime,
          direction: "outgoing",
        };
      });

      return {
        message: "Outgoing shipments retrieved successfully",
        statusCode: 200,
        data: outgoingShipments,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getPerformanceMetrics(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get all deliveries for the company/branch
      const deliveries = await prisma.delivery.findMany({
        where: {
          OR: [{ supplierCompanyId: companyId }, { buyerCompanyId: companyId }],
          ...(branchId ? { branchId } : {}),
          status: "DELIVERED",
        },
        select: {
          plannedDeliveryDate: true,
          actualDeliveryDate: true,
          deliveryCharges: true,
        },
      });

      // Calculate on-time delivery percentage
      const onTimeDeliveries = deliveries.filter((delivery) => {
        if (!delivery.actualDeliveryDate) return false;
        return (
          new Date(delivery.actualDeliveryDate) <=
          new Date(delivery.plannedDeliveryDate)
        );
      });

      const onTimePercentage =
        deliveries.length > 0
          ? Math.round((onTimeDeliveries.length / deliveries.length) * 100)
          : 0;

      // Calculate average delivery time
      const avgDeliveryTime =
        deliveries.length > 0
          ? deliveries.reduce((total, delivery) => {
              if (!delivery.actualDeliveryDate) return total;
              const diffHours =
                Math.abs(
                  new Date(delivery.actualDeliveryDate).getTime() -
                    new Date(delivery.plannedDeliveryDate).getTime(),
                ) /
                (1000 * 60 * 60);
              return total + diffHours;
            }, 0) / deliveries.length
          : 0;

      // Calculate total shipping cost
      const totalShippingCost = deliveries.reduce((total, delivery) => {
        return total + Number(delivery.deliveryCharges || 0);
      }, 0);

      const performanceMetrics = [
        {
          label: "On-Time Delivery",
          value: `${onTimePercentage}%`,
          trend: "+2%", // This would need historical data
          color:
            onTimePercentage >= 90
              ? "text-green-600"
              : onTimePercentage >= 80
                ? "text-yellow-600"
                : "text-red-600",
        },
        {
          label: "Average Delivery Time",
          value: `${Math.round(avgDeliveryTime)}h`,
          trend: "-5%",
          color: "text-blue-600",
        },
        {
          label: "Total Shipments",
          value: deliveries.length.toString(),
          trend: "+12%",
          color: "text-purple-600",
        },
        {
          label: "Shipping Cost",
          value: `$${totalShippingCost.toLocaleString()}`,
          trend: "-3%",
          color: "text-orange-600",
        },
      ];

      return {
        message: "Performance metrics retrieved successfully",
        statusCode: 200,
        data: performanceMetrics,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getRecentActivity(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get recent delivery tracking entries
      const trackingEntries = await prisma.deliveryTracking.findMany({
        where: {
          delivery: {
            OR: [
              { supplierCompanyId: companyId },
              { buyerCompanyId: companyId },
            ],
            ...(branchId ? { branchId } : {}),
          },
        },
        include: {
          delivery: true,
          updatedBy: true,
        },
        orderBy: { timestamp: "desc" },
        take: 20,
      });

      const recentActivity = trackingEntries.map((entry) => {
        const now = new Date();
        const entryTime = new Date(entry.timestamp);
        const diffMinutes = Math.floor(
          (now.getTime() - entryTime.getTime()) / (1000 * 60),
        );

        let timeAgo = "Just now";
        if (diffMinutes < 1) {
          timeAgo = "Just now";
        } else if (diffMinutes < 60) {
          timeAgo = `${diffMinutes} mins ago`;
        } else if (diffMinutes < 1440) {
          timeAgo = `${Math.floor(diffMinutes / 60)} hours ago`;
        } else {
          timeAgo = `${Math.floor(diffMinutes / 1440)} days ago`;
        }

        // Determine message type and content
        let message = entry.description || `Status updated to ${entry.status}`;
        let type = "info";

        if (entry.status === "DELIVERED") {
          type = "success";
          message = `${(entry as any).delivery?.deliveryNumber || entry.deliveryId} delivered successfully`;
        } else if (entry.status === "IN_TRANSIT") {
          type = "info";
          message = `${(entry as any).delivery?.deliveryNumber || entry.deliveryId} is in transit`;
        } else if (entry.status === "CANCELLED") {
          type = "error";
          message = `${(entry as any).delivery?.deliveryNumber || entry.deliveryId} was cancelled`;
        }

        return {
          id: entry.id,
          time: timeAgo,
          message,
          type,
          shipmentId:
            (entry as any).delivery?.deliveryNumber || entry.deliveryId,
          userId: entry.updatedById,
        };
      });

      return {
        message: "Recent activity retrieved successfully",
        statusCode: 200,
        data: recentActivity,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getCarrierPerformance(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get deliveries grouped by carrier
      const deliveries = await prisma.delivery.findMany({
        where: {
          OR: [{ supplierCompanyId: companyId }, { buyerCompanyId: companyId }],
          ...(branchId ? { branchId } : {}),
        },
        select: {
          courierService: true,
          status: true,
          deliveryCharges: true,
          plannedDeliveryDate: true,
          actualDeliveryDate: true,
        },
      });

      // Group by carrier
      const carrierMap = new Map();
      deliveries.forEach((delivery) => {
        const carrier = delivery.courierService || "Unknown";
        if (!carrierMap.has(carrier)) {
          carrierMap.set(carrier, {
            shipments: 0,
            onTime: 0,
            totalCost: 0,
            totalValue: 0,
            transitTimes: [],
          });
        }
        const data = carrierMap.get(carrier);
        data.shipments++;
        data.totalCost += Number(delivery.deliveryCharges || 0);

        // Check if on time
        if (delivery.status === "DELIVERED" && delivery.actualDeliveryDate) {
          if (
            new Date(delivery.actualDeliveryDate) <=
            new Date(delivery.plannedDeliveryDate)
          ) {
            data.onTime++;
          }

          // Calculate transit time
          const transitTime =
            Math.abs(
              new Date(delivery.actualDeliveryDate).getTime() -
                new Date(delivery.plannedDeliveryDate).getTime(),
            ) /
            (1000 * 60 * 60); // hours
          data.transitTimes.push(transitTime);
        }
      });

      const carrierPerformance = Array.from(carrierMap.entries()).map(
        ([carrier, data]) => {
          const onTimePercentage =
            data.shipments > 0
              ? Math.round((data.onTime / data.shipments) * 100)
              : 0;
          const avgTransitTime =
            data.transitTimes.length > 0
              ? data.transitTimes.reduce(
                  (sum: number, time: number) => sum + time,
                  0,
                ) / data.transitTimes.length
              : 0;
          const avgCost =
            data.shipments > 0 ? data.totalCost / data.shipments : 0;

          return {
            id: `carrier-${carrier.toLowerCase().replace(/\s+/g, "-")}`,
            name: carrier,
            shipments: data.shipments,
            onTime: onTimePercentage,
            avgCost: Math.round(avgCost),
            rating:
              onTimePercentage >= 95
                ? 4.8
                : onTimePercentage >= 90
                  ? 4.5
                  : onTimePercentage >= 80
                    ? 4.0
                    : 3.5,
            totalValue: data.totalCost,
            avgTransitTime: `${Math.round(avgTransitTime)}h`,
            reliability: onTimePercentage,
          };
        },
      );

      // Sort by rating
      carrierPerformance.sort((a, b) => b.rating - a.rating);

      return {
        message: "Carrier performance retrieved successfully",
        statusCode: 200,
        data: carrierPerformance,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getCostBreakdown(
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Get all delivery charges
      const deliveries = await prisma.delivery.findMany({
        where: {
          OR: [{ supplierCompanyId: companyId }, { buyerCompanyId: companyId }],
          ...(branchId ? { branchId } : {}),
        },
        select: {
          deliveryCharges: true,
          courierService: true,
        },
      });

      const totalCost = deliveries.reduce((sum, delivery) => {
        return sum + Number(delivery.deliveryCharges || 0);
      }, 0);

      // Group by carrier for transportation costs
      const carrierMap = new Map();
      deliveries.forEach((delivery) => {
        const carrier = delivery.courierService || "Unknown";
        const cost = Number(delivery.deliveryCharges || 0);
        carrierMap.set(carrier, (carrierMap.get(carrier) || 0) + cost);
      });

      const costBreakdown = [
        {
          label: "Transportation",
          amount: totalCost,
          percentage: 100, // All costs are transportation in this simplified model
          category: "transport",
        },
        {
          label: "Insurance",
          amount: Math.round(totalCost * 0.05), // 5% of transportation
          percentage: 5,
          category: "insurance",
        },
        {
          label: "Handling",
          amount: Math.round(totalCost * 0.03), // 3% of transportation
          percentage: 3,
          category: "handling",
        },
        {
          label: "Documentation",
          amount: Math.round(totalCost * 0.02), // 2% of transportation
          percentage: 2,
          category: "documentation",
        },
      ];

      return {
        message: "Cost breakdown retrieved successfully",
        statusCode: 200,
        data: costBreakdown,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async getMonthlyTrends(
    req: AuthRequest,
    months: number = 6,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const trends = [];
      const now = new Date();

      for (let i = months - 1; i >= 0; i--) {
        const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const endDate = new Date(
          now.getFullYear(),
          now.getMonth() - i + 1,
          0,
          23,
          59,
          59,
        );

        const monthName = startDate.toLocaleDateString("en-US", {
          month: "long",
        });
        const year = startDate.getFullYear();

        const branchId = req.user?.branchId;
        // Get deliveries for this month
        const deliveries = await prisma.delivery.findMany({
          where: {
            OR: [
              { supplierCompanyId: companyId },
              { buyerCompanyId: companyId },
            ],
            ...(branchId ? { branchId } : {}),
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          select: {
            status: true,
            deliveryCharges: true,
            plannedDeliveryDate: true,
            actualDeliveryDate: true,
          },
        });

        const shipments = deliveries.length;
        const cost = deliveries.reduce((sum, delivery) => {
          return sum + Number(delivery.deliveryCharges || 0);
        }, 0);

        // Calculate on-time percentage
        const deliveredShipments = deliveries.filter(
          (d) => d.status === "DELIVERED",
        );
        const onTimeShipments = deliveredShipments.filter((delivery) => {
          if (!delivery.actualDeliveryDate) return false;
          return (
            new Date(delivery.actualDeliveryDate) <=
            new Date(delivery.plannedDeliveryDate)
          );
        });
        const onTime =
          deliveredShipments.length > 0
            ? Math.round(
                (onTimeShipments.length / deliveredShipments.length) * 100,
              )
            : 0;

        // Calculate revenue (simplified - using delivery charges as revenue)
        const revenue = cost;

        trends.push({
          month: monthName,
          year,
          shipments,
          cost,
          onTime,
          revenue,
        });
      }

      return {
        message: "Monthly trends retrieved successfully",
        statusCode: 200,
        data: trends,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  public static async updateShipmentStatus(
    shipmentId: string,
    data: {
      status: string;
      location?: string;
    },
    req: AuthRequest,
  ): Promise<IResponse<unknown>> {
    try {
      const companyId = req.user?.company?.companyId;
      if (!companyId) {
        throw new AppError("Company ID is missing", 400);
      }

      const branchId = req.user?.branchId;
      // Find the delivery
      const delivery = await prisma.delivery.findFirst({
        where: {
          deliveryNumber: shipmentId,
          OR: [{ supplierCompanyId: companyId }, { buyerCompanyId: companyId }],
          ...(branchId ? { branchId } : {}),
        },
      });

      if (!delivery) {
        throw new AppError("Shipment not found", 404);
      }

      // Update delivery status
      const updateData: {
        status:
          | "PENDING"
          | "IN_TRANSIT"
          | "DELIVERED"
          | "CANCELLED"
          | "PARTIALLY_DELIVERED";
        actualDeliveryDate?: Date;
      } = {
        status: data.status.toUpperCase() as
          | "PENDING"
          | "IN_TRANSIT"
          | "DELIVERED"
          | "CANCELLED"
          | "PARTIALLY_DELIVERED",
      };

      if (data.status.toLowerCase() === "delivered") {
        updateData.actualDeliveryDate = new Date();
      }

      await prisma.delivery.update({
        where: { id: delivery.id },
        data: updateData,
      });

      // Create tracking entry
      await prisma.deliveryTracking.create({
        data: {
          deliveryId: delivery.id,
          status: data.status.toUpperCase() as
            | "PENDING"
            | "IN_TRANSIT"
            | "DELIVERED"
            | "CANCELLED"
            | "PARTIALLY_DELIVERED",
          location: data.location,
          description: `Status updated to ${data.status}`,
          updatedById: req.user?.id,
        },
      });

      return {
        message: "Shipment status updated successfully",
        statusCode: 200,
        data: {
          success: true,
        },
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }
}
