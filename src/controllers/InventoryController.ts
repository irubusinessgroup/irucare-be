import { Get, Route, Tags, Security, Request, Query, Middlewares } from "tsoa";
import { InventoryService } from "../services/InventoryService";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

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
    @Query() page?: number,
  ) {
    return InventoryService.getInventory(req, searchq, limit, page);
  }

  @Get("/expiring")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getExpiringItems(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return InventoryService.getExpiringItems(req, searchq, limit, page);
  }
}
