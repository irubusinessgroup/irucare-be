import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";

export interface STRData {
  itemId: string;
  itemName: string;
  unitsReceived: number;
  unitsSold: number;
  sellThroughRate: number;
  period: string;
  companyId: string;
}

export interface STRFilters {
  startDate?: Date;
  endDate?: Date;
  itemId?: string;
  categoryId?: string;
  period?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
}

export class SellThroughRateService {
  /**
   * Calculate STR for a specific item within a date range
   */
  public static async calculateItemSTR(
    itemId: string,
    companyId: string,
    filters: STRFilters = {},
  ): Promise<STRData> {
    const { startDate, endDate } = this.getDateRange(filters);

    // Get item details
    const item = await prisma.items.findUnique({
      where: { id: itemId },
      include: { category: true },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    // Calculate units received from stock receipts
    const unitsReceived = await this.getUnitsReceived(
      itemId,
      companyId,
      startDate,
      endDate,
    );

    // Calculate units sold
    const unitsSold = await this.getUnitsSold(
      itemId,
      companyId,
      startDate,
      endDate,
    );

    // Calculate STR
    const sellThroughRate =
      unitsReceived > 0 ? (unitsSold / unitsReceived) * 100 : 0;

    return {
      itemId,
      itemName: item.itemFullName,
      unitsReceived,
      unitsSold,
      sellThroughRate: Math.round(sellThroughRate * 100) / 100, // Round to 2 decimal places
      period: this.formatPeriod(startDate, endDate),
      companyId,
    };
  }

  /**
   * Get STR for all items in a company
   */
  public static async getCompanySTR(
    req: Request,
    filters: STRFilters = {},
  ): Promise<STRData[]> {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const { startDate, endDate } = this.getDateRange(filters);

    // Get all items for the company
    const items = await prisma.items.findMany({
      where: {
        companyId,
        ...(filters.categoryId && { categoryId: filters.categoryId }),
      },
      include: { category: true },
    });

    const strData: STRData[] = [];

    for (const item of items) {
      const unitsReceived = await this.getUnitsReceived(
        item.id,
        companyId,
        startDate,
        endDate,
      );
      const unitsSold = await this.getUnitsSold(
        item.id,
        companyId,
        startDate,
        endDate,
      );

      const sellThroughRate =
        unitsReceived > 0 ? (unitsSold / unitsReceived) * 100 : 0;

      strData.push({
        itemId: item.id,
        itemName: item.itemFullName,
        unitsReceived,
        unitsSold,
        sellThroughRate: Math.round(sellThroughRate * 100) / 100,
        period: this.formatPeriod(startDate, endDate),
        companyId,
      });
    }

    // Sort by STR descending (best performers first)
    return strData.sort((a, b) => b.sellThroughRate - a.sellThroughRate);
  }

  /**
   * Get STR trends over time
   */
  public static async getSTRTrends(
    req: Request,
    itemId: string,
    period: "monthly" | "quarterly" = "monthly",
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const trends = [];
    const months = period === "monthly" ? 12 : 4; // Last 12 months or 4 quarters

    for (let i = months - 1; i >= 0; i--) {
      const { startDate, endDate } = this.getPeriodDates(period, i);

      const unitsReceived = await this.getUnitsReceived(
        itemId,
        companyId,
        startDate,
        endDate,
      );
      const unitsSold = await this.getUnitsSold(
        itemId,
        companyId,
        startDate,
        endDate,
      );

      const sellThroughRate =
        unitsReceived > 0 ? (unitsSold / unitsReceived) * 100 : 0;

      trends.push({
        period: this.formatPeriod(startDate, endDate),
        unitsReceived,
        unitsSold,
        sellThroughRate: Math.round(sellThroughRate * 100) / 100,
        startDate,
        endDate,
      });
    }

    return trends;
  }

  /**
   * Get STR summary statistics
   */
  public static async getSTRSummary(req: Request, filters: STRFilters = {}) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const strData = await this.getCompanySTR(req, filters);

    if (strData.length === 0) {
      return {
        totalItems: 0,
        averageSTR: 0,
        bestPerformer: null,
        worstPerformer: null,
        itemsAboveTarget: 0,
        itemsBelowTarget: 0,
      };
    }

    const totalSTR = strData.reduce(
      (sum, item) => sum + item.sellThroughRate,
      0,
    );
    const averageSTR = totalSTR / strData.length;
    const targetSTR = 70; // Industry standard

    return {
      totalItems: strData.length,
      averageSTR: Math.round(averageSTR * 100) / 100,
      bestPerformer: strData[0], // Already sorted by STR descending
      worstPerformer: strData[strData.length - 1],
      itemsAboveTarget: strData.filter(
        (item) => item.sellThroughRate >= targetSTR,
      ).length,
      itemsBelowTarget: strData.filter(
        (item) => item.sellThroughRate < targetSTR,
      ).length,
      targetSTR,
    };
  }

  // Helper methods
  private static async getUnitsReceived(
    itemId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await prisma.stockReceipts.aggregate({
      where: {
        itemId,
        companyId,
        dateReceived: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        quantityReceived: true,
      },
    });

    return Number(result._sum.quantityReceived || 0);
  }

  private static async getUnitsSold(
    itemId: string,
    companyId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await prisma.sell.aggregate({
      where: {
        itemId,
        companyId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        quantity: true,
      },
    });

    return Number(result._sum.quantity || 0);
  }

  private static getDateRange(filters: STRFilters): {
    startDate: Date;
    endDate: Date;
  } {
    if (filters.startDate && filters.endDate) {
      return {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };
    }

    // Default to last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    return { startDate, endDate };
  }

  private static getPeriodDates(
    period: "monthly" | "quarterly",
    offset: number,
  ) {
    const endDate = new Date();
    const startDate = new Date();

    if (period === "monthly") {
      startDate.setMonth(endDate.getMonth() - offset);
      startDate.setDate(1);
      endDate.setMonth(endDate.getMonth() - offset + 1);
      endDate.setDate(0);
    } else {
      const quarter = Math.floor(endDate.getMonth() / 3) - offset;
      startDate.setMonth(quarter * 3);
      startDate.setDate(1);
      endDate.setMonth(quarter * 3 + 3);
      endDate.setDate(0);
    }

    return { startDate, endDate };
  }

  private static formatPeriod(startDate: Date, endDate: Date): string {
    const start = startDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    const end = endDate.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });

    if (start === end) {
      return start;
    }

    return `${start} - ${end}`;
  }
}
