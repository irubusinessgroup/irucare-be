import {
  Get,
  Route,
  Request,
  Tags,
  Query,
  Security,
  Middlewares,
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
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getStockLogisticsStats(@Request() req: ExpressRequest) {
    return DashboardService.getStockLogisticsStats(req);
  }

  @Get("/inventory/categories-summary")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getInventoryCategoriesSummary(@Request() req: ExpressRequest) {
    return DashboardService.getInventoryCategoriesSummary(req);
  }

  @Get("/inventory/reorder-alerts")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getReorderAlerts(@Request() req: ExpressRequest) {
    return DashboardService.getReorderAlerts(req);
  }

  @Get("/recent-shipments")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getRecentShipments(
    @Request() req: ExpressRequest,
    @Query() limit?: number,
  ) {
    return DashboardService.getRecentShipments(req, limit);
  }

  @Get("/inventory-trends")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getInventoryTrends(
    @Request() req: ExpressRequest,
    @Query() months?: number,
  ) {
    return DashboardService.getInventoryTrends(req, months);
  }
}
