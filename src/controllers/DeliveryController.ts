import {
  Body,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import {
  CreateDeliveryDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
  DeliveryTrackingDto,
  CancelDeliveryDto,
  ConfirmDeliveryDto,
} from "../utils/interfaces/common";
import { DeliveryService } from "../services/DeliveryService";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

@Security("jwt")
@Route("/api/deliveries")
@Tags("Delivery Management")
export class DeliveryController {
  // Create delivery (Supplier only)
  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createDelivery(
    @Body() body: CreateDeliveryDto,
    @Request() req: ExpressRequest,
  ) {
    return DeliveryService.createDelivery(body, req);
  }

  // Update delivery details (Supplier only)
  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateDelivery(
    @Path() id: string,
    @Body() body: UpdateDeliveryDto,
    @Request() req: ExpressRequest,
  ) {
    return DeliveryService.updateDelivery(id, body, req);
  }

  // Update delivery status (Both supplier and buyer)
  @Put("/{id}/status")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateDeliveryStatus(
    @Path() id: string,
    @Body() body: UpdateDeliveryStatusDto,
    @Request() req: ExpressRequest,
  ) {
    const io = req.app.get("io");
    return DeliveryService.updateDeliveryStatus(id, body, req, io);
  }

  // Get supplier's outgoing deliveries
  @Get("/supplier")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getSupplierDeliveries(@Request() req: ExpressRequest) {
    return DeliveryService.getSupplierDeliveries(req);
  }

  // Get buyer's incoming deliveries
  @Get("/buyer")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getBuyerDeliveries(@Request() req: ExpressRequest) {
    return DeliveryService.getBuyerDeliveries(req);
  }

  // Get specific delivery by ID
  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getDeliveryById(@Path() id: string, @Request() req: ExpressRequest) {
    return DeliveryService.getDeliveryById(id, req);
  }

  // Add tracking information
  @Post("/{id}/tracking")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public addDeliveryTracking(
    @Path() id: string,
    @Body() body: DeliveryTrackingDto,
    @Request() req: ExpressRequest,
  ) {
    return DeliveryService.addDeliveryTracking(id, body, req);
  }

  // Cancel delivery (Supplier only)
  @Put("/{id}/cancel")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public cancelDelivery(
    @Path() id: string,
    @Body() body: CancelDeliveryDto,
    @Request() req: ExpressRequest,
  ) {
    const io = req.app.get("io");
    return DeliveryService.cancelDelivery(id, body.reason, req, io);
  }

  // Confirm delivery receipt (Buyer only)
  @Put("/{id}/confirm")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public confirmDelivery(
    @Path() id: string,
    @Body() body: ConfirmDeliveryDto,
    @Request() req: ExpressRequest,
  ) {
    const io = req.app.get("io");
    return DeliveryService.confirmDeliveryReceipt(id, body, req, io);
  }

  // Auto-create delivery from approved PO (called internally)
  @Post("/auto-create/{purchaseOrderId}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public autoCreateDelivery(
    @Path() purchaseOrderId: string,
    @Request() req: ExpressRequest,
  ) {
    return DeliveryService.autoCreateDeliveryFromApprovedPO(
      purchaseOrderId,
      req,
    );
  }
}
