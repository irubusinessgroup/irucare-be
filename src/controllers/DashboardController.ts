import {
  Get,
  Post,
  Put,
  Route,
  Request,
  Tags,
  Query,
  Security,
  Middlewares,
  Body,
  Path,
} from "tsoa";
import { DashboardService } from "../services/DashboardService";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import { Request as ExpressRequest } from "express";

@Security("jwt")
@Route("/api/dashboard")
@Tags("Dashboard")
export class DashboardController {
  @Get("/stock-logistics/stats")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getStockLogisticsStats(@Request() req: ExpressRequest) {
    return DashboardService.getStockLogisticsStats(req);
  }

  @Get("/inventory/categories-summary")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getInventoryCategoriesSummary(@Request() req: ExpressRequest) {
    return DashboardService.getInventoryCategoriesSummary(req);
  }

  @Get("/inventory/reorder-alerts")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getReorderAlerts(@Request() req: ExpressRequest) {
    return DashboardService.getReorderAlerts(req);
  }

  @Get("/recent-shipments")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getRecentShipments(
    @Request() req: ExpressRequest,
    @Query() limit?: number,
  ) {
    return DashboardService.getRecentShipments(req, limit);
  }

  @Get("/inventory-trends")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getInventoryTrends(
    @Request() req: ExpressRequest,
    @Query() months?: number,
  ) {
    return DashboardService.getInventoryTrends(req, months);
  }

  // Inventory Dashboard APIs
  @Get("/inventory/category-performance")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getCategoryPerformance(@Request() req: ExpressRequest) {
    return DashboardService.getCategoryPerformance(req);
  }

  @Get("/inventory/aging-analysis")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getInventoryAgingAnalysis(@Request() req: ExpressRequest) {
    return DashboardService.getInventoryAgingAnalysis(req);
  }

  @Get("/inventory/low-stock-items")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getLowStockItems(@Request() req: ExpressRequest) {
    return DashboardService.getLowStockItems(req);
  }

  @Get("/inventory/top-performers")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getTopPerformers(@Request() req: ExpressRequest) {
    return DashboardService.getTopPerformers(req);
  }

  @Get("/inventory/warehouse-utilization")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getWarehouseUtilization(@Request() req: ExpressRequest) {
    return DashboardService.getWarehouseUtilization(req);
  }

  // Reorder Alerts APIs
  @Get("/reorder-alerts/critical-items")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getCriticalItems(@Request() req: ExpressRequest) {
    return DashboardService.getCriticalItems(req);
  }

  @Get("/reorder-alerts/warning-items")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getWarningItems(@Request() req: ExpressRequest) {
    return DashboardService.getWarningItems(req);
  }

  @Get("/reorder-alerts/supplier-summary")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getSupplierSummary(@Request() req: ExpressRequest) {
    return DashboardService.getSupplierSummary(req);
  }

  @Post("/reorder-alerts/create-request")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createReorderRequest(
    @Request() req: ExpressRequest,
    @Body()
    body: {
      itemId: string;
      quantity: number;
      supplierId: string;
      priority: string;
    },
  ) {
    return DashboardService.createReorderRequest(body, req);
  }

  // Shipments Dashboard APIs
  @Get("/shipments/incoming")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getIncomingShipments(@Request() req: ExpressRequest) {
    return DashboardService.getIncomingShipments(req);
  }

  @Get("/shipments/outgoing")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getOutgoingShipments(@Request() req: ExpressRequest) {
    return DashboardService.getOutgoingShipments(req);
  }

  @Get("/shipments/performance-metrics")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getPerformanceMetrics(@Request() req: ExpressRequest) {
    return DashboardService.getPerformanceMetrics(req);
  }

  @Get("/shipments/recent-activity")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getRecentActivity(@Request() req: ExpressRequest) {
    return DashboardService.getRecentActivity(req);
  }

  @Get("/shipments/carrier-performance")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getCarrierPerformance(@Request() req: ExpressRequest) {
    return DashboardService.getCarrierPerformance(req);
  }

  @Get("/shipments/cost-breakdown")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getCostBreakdown(@Request() req: ExpressRequest) {
    return DashboardService.getCostBreakdown(req);
  }

  @Get("/shipments/monthly-trends")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getMonthlyTrends(
    @Request() req: ExpressRequest,
    @Query() months?: number,
  ) {
    return DashboardService.getMonthlyTrends(req, months);
  }

  @Put("/shipments/{shipmentId}/status")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateShipmentStatus(
    @Request() req: ExpressRequest,
    @Path() shipmentId: string,
    @Body()
    body: {
      status: string;
      location?: string;
    },
  ) {
    return DashboardService.updateShipmentStatus(shipmentId, body, req);
  }
}
