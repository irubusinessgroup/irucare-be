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
  CreateClientOrderDto,
  UpdateClientOrderDto,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/purchase-orders")
@Tags("Purchase Order")
export class Purchase {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllPurchaseOrders(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    return PurchaseOrderService.getAllPurchaseOrders(req, searchq, limit, page);
  }

  @Get("/client/order")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getClientOrder(@Request() req: ExpressRequest) {
    return PurchaseOrderService.getClientOrders(req);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getPurchaseOrderById(
    @Path() id: string,
    @Request() req: ExpressRequest
  ) {
    return PurchaseOrderService.getPurchaseOrderById(id, req);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public async createPurchaseOrder(
    @Body() body: CreatePurchaseOrderDto,
    @Request() req: ExpressRequest
  ) {
    const io = req.app.get("io");
    return PurchaseOrderService.createPurchaseOrder(body, req, io);
  }
  // Client order endpoints
  @Post("/client-orders")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createClientOrder(
    @Body() body: CreateClientOrderDto,
    @Request() req: ExpressRequest
  ) {
    return PurchaseOrderService.createClientOrder(body, req);
  }

  @Put("/client-orders/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateClientOrder(
    @Path() id: string,
    @Body() body: UpdateClientOrderDto,
    @Request() req: ExpressRequest
  ) {
    return PurchaseOrderService.updateClientOrder(id, body, req);
  }

  @Delete("/client-orders/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteClientOrder(@Path() id: string, @Request() req: ExpressRequest) {
    return PurchaseOrderService.deleteClientOrder(id, req);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updatePurchaseOrder(
    @Path() id: string,
    @Body() body: UpdatePurchaseOrderDto,
    @Request() req: ExpressRequest
  ) {
    return PurchaseOrderService.updatePurchaseOrder(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deletePurchaseOrder(
    @Path() id: string,
    @Request() req: ExpressRequest
  ) {
    return PurchaseOrderService.deletePurchaseOrder(id, req);
  }
}
