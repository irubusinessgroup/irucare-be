import {
  Get,
  Route,
  Tags,
  Request,
  Path,
  Query,
  Security,
  Middlewares,
} from "tsoa";
import {
  SellThroughRateService,
  STRFilters,
} from "../services/SellThroughRateService";
import { Request as ExpressRequest } from "express";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

@Security("jwt")
@Route("/api/analytics")
@Tags("Analytics")
export class SellThroughRateController {
  /**
   * Get STR for a specific item
   */
  @Get("/sell-through-rate/item/{itemId}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async getItemSTR(
    @Path() itemId: string,
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() period?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly",
  ) {
    const filters: STRFilters = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      period,
    };

    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new Error("Company ID is missing");
    }

    return SellThroughRateService.calculateItemSTR(itemId, companyId, filters);
  }

  /**
   * Get STR for all items in company
   */
  @Get("/sell-through-rate/company")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async getCompanySTR(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() categoryId?: string,
    @Query() period?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly",
  ) {
    const filters: STRFilters = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      categoryId,
      period,
    };

    return SellThroughRateService.getCompanySTR(req, filters);
  }

  /**
   * Get STR trends over time for an item
   */
  @Get("/sell-through-rate/trends/{itemId}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async getSTRTrends(
    @Path() itemId: string,
    @Request() req: ExpressRequest,
    @Query() period: "monthly" | "quarterly" = "monthly",
  ) {
    return SellThroughRateService.getSTRTrends(req, itemId, period);
  }

  /**
   * Get STR summary statistics
   */
  @Get("/sell-through-rate/summary")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async getSTRSummary(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() categoryId?: string,
    @Query() period?: "daily" | "weekly" | "monthly" | "quarterly" | "yearly",
  ) {
    const filters: STRFilters = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      categoryId,
      period,
    };

    return SellThroughRateService.getSTRSummary(req, filters);
  }
}
