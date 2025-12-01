import {
  Get,
  Route,
  Tags,
  Security,
  Request,
  Query,
  Middlewares,
  Body,
  Post,
} from "tsoa";
import { InventoryService } from "../services/InventoryService";
import { Request as ExpressRequest } from "express";
import { ClinicRole, roles } from "../utils/roles";
import { checkClinicRole, checkRole } from "../middlewares";
import { DirectStockAdditionRequest } from "../utils/interfaces/common";
import { prisma } from "../utils/client";

@Security("jwt")
@Route("/api/inventory")
@Tags("Inventory")
export class InventoryController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getInventory(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    return InventoryService.getInventory(req, searchq, limit, page);
  }

  @Get("/expiring")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getExpiringItems(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    return InventoryService.getExpiringItems(req, searchq, limit, page);
  }

  @Get("/expired")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getExpiredItems(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    return InventoryService.getExpiredItems(req, searchq, limit, page);
  }

  @Post("/direct-add")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public addDirectStock(
    @Request() req: ExpressRequest,
    @Body() stockData: DirectStockAdditionRequest
  ) {
    return InventoryService.addDirectStock(req, stockData);
  }

  /**
   * Get stock overview with all statistics
   */
  @Get("/overview")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public async getStockOverview(@Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    // Get total items
    const totalItems = await prisma.items.count({
      where: { companyId },
    });

    // Get total stock value
    const stockReceipts = await prisma.stockReceipts.findMany({
      where: { companyId },
      include: {
        stocks: {
          where: { status: { in: ["AVAILABLE", "RESERVED"] } },
        },
      },
    });

    const totalValue = stockReceipts.reduce((sum, receipt) => {
      const availableQty = receipt.stocks.reduce(
        (s, stock) => s + Number(stock.quantityAvailable),
        0
      );
      return sum + availableQty * Number(receipt.unitCost);
    }, 0);

    // Get low stock count
    const reorderRules = await prisma.reorderRule.findMany({
      where: { companyId },
    });

    let lowStockCount = 0;
    for (const rule of reorderRules) {
      const stocks = await prisma.stock.findMany({
        where: {
          stockReceipt: {
            itemId: rule.itemId,
            companyId,
          },
          status: { in: ["AVAILABLE", "RESERVED"] },
        },
      });

      const currentStock = stocks.reduce(
        (sum, s) => sum + Number(s.quantityAvailable),
        0
      );

      if (currentStock <= rule.minLevel.toNumber()) {
        lowStockCount++;
      }
    }

    // Get expiring soon count
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringSoonCount = await prisma.stockReceipts.count({
      where: {
        companyId,
        expiryDate: {
          not: null,
          gt: new Date(),
          lte: thirtyDaysFromNow,
        },
      },
    });

    // Get recent movements
    const recentMovements = await prisma.stockMovement.findMany({
      where: { companyId },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        item: {
          select: { itemFullName: true, itemCodeSku: true },
        },
        fromWarehouse: { select: { warehousename: true } },
        toWarehouse: { select: { warehousename: true } },
      },
    });

    return {
      message: "Stock overview retrieved successfully",
      data: {
        totalItems,
        totalValue,
        lowStockCount,
        expiringSoonCount,
        recentMovements,
      },
    };
  }
}
