import { prisma } from "../utils/client";
import { IResponse } from "../utils/interfaces/common";
import AppError from "../utils/error";
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
          companyId: companyId,
          status: {
            in: ["PENDING", "IN_TRANSIT"],
          },
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
          companyId: companyId,
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
          company: true,
          sell: { include: { client: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const recentShipments = deliveries.map((delivery) => {
        const totalUnits = delivery.deliveryItems.reduce((total, item) => {
          return total + Number(item.quantityToDeliver);
        }, 0);

        const uniqueCategories = [
          ...new Set(
            delivery.deliveryItems
              .map((item) => item.item?.category?.categoryName)
              .filter((c) => !!c),
          ),
        ];
        const category =
          uniqueCategories.length > 1 ? "Mixed" : uniqueCategories[0] || "N/A";

        const direction = "outgoing";

        const now = new Date();
        const plannedDate = new Date(delivery.plannedDeliveryDate);
        const timeDiff = plannedDate.getTime() - now.getTime();
        const hoursRemaining = Math.ceil(timeDiff / (1000 * 60 * 60));

        let timeRemaining = "Overdue";
        if (delivery.status === "DELIVERED") {
          timeRemaining = "Delivered";
        } else if (hoursRemaining > 24) {
          timeRemaining = `${Math.ceil(hoursRemaining / 24)} days`;
        } else if (hoursRemaining > 0) {
          timeRemaining = `${hoursRemaining} hours`;
        }

        let status = delivery.status.toLowerCase();
        if (status === "pending") status = "pending";
        else if (status === "in_transit") status = "in-transit";
        else if (status === "delivered") status = "delivered";
        else if (status === "partially_delivered")
          status = "partially-delivered";
        else if (status === "cancelled") status = "cancelled";

        const shipmentValue = delivery.deliveryItems.reduce((total, item) => {
          const unitPrice = Number(item.actualUnitPrice || 0);
          return total + unitPrice * Number(item.quantityToDeliver);
        }, 0);

        return {
          id: delivery.id,
          shipmentId: delivery.deliveryNumber,
          category,
          direction,
          units: totalUnits,
          status,
          timeRemaining,
          companyName:
            delivery.sell?.client?.name ||
            delivery.contactPerson ||
            delivery.company.name,
          deliveryDate: delivery.plannedDeliveryDate,
          carrier: delivery.courierService || delivery.driverName || "Unknown",
          value: shipmentValue,
          estimatedCost: Number(delivery.deliveryCharges || 0),
          currentLocation:
            status === "delivered"
              ? "Arrived"
              : status === "pending"
                ? "At Origin"
                : status === "cancelled"
                  ? "Cancelled"
                  : "In Transit",
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

        // Sale-invoice deliveries are outbound only (no buyer-company inbound)
        const incomingShipments = 0;

        const outgoingShipments = await prisma.delivery.count({
          where: {
            companyId: companyId,
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
        companyId: companyId,
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
}

