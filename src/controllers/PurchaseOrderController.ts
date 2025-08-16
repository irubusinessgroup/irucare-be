import {
  Body,
  Get,
  Post,
  Put,
  Delete,
  Route,
  Tags,
  Path,
  Security,
  Request,
  Query,
  Middlewares,
} from "tsoa";
import { PurchaseOrderService } from "../services/PurchaseOrderService";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/purchase-orders")
@Tags("Purchase Order")
export class PurchaseOrderController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllPurchaseOrders(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return PurchaseOrderService.getAllPurchaseOrders(req, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getPurchaseOrderById(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ) {
    return PurchaseOrderService.getPurchaseOrderById(id, req);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createPurchaseOrder(
    @Body() body: CreatePurchaseOrderDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return PurchaseOrderService.createPurchaseOrder(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updatePurchaseOrder(
    @Path() id: string,
    @Body() body: UpdatePurchaseOrderDto,
    @Request() req: ExpressRequest,
  ) {
    return PurchaseOrderService.updatePurchaseOrder(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deletePurchaseOrder(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ) {
    return PurchaseOrderService.deletePurchaseOrder(id, req);
  }
}
