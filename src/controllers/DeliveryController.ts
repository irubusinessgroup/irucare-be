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
} from "../utils/interfaces/common";
import { DeliveryService } from "../services/DeliveryService";
import { checkRole } from "../middlewares";
import { STAFF_OPS_ROLES } from "../utils/roles";

/** Sale-invoice delivery plans only (EBM). Legacy PO / buyer-confirm APIs removed. */
@Security("jwt")
@Route("/api/deliveries")
@Tags("Delivery Management")
export class DeliveryController {
  @Post("/")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public createDelivery(
    @Body() body: CreateDeliveryDto,
    @Request() req: ExpressRequest,
  ) {
    return DeliveryService.createDelivery(body, req);
  }

  @Put("/{id}")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public updateDelivery(
    @Path() id: string,
    @Body() body: UpdateDeliveryDto,
    @Request() req: ExpressRequest,
  ) {
    return DeliveryService.updateDelivery(id, body, req);
  }

  @Put("/{id}/status")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public updateDeliveryStatus(
    @Path() id: string,
    @Body() body: UpdateDeliveryStatusDto,
    @Request() req: ExpressRequest,
  ) {
    const io = req.app.get("io");
    return DeliveryService.updateDeliveryStatus(id, body, req, io);
  }

  @Get("/supplier")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getSupplierDeliveries(@Request() req: ExpressRequest) {
    return DeliveryService.getSupplierDeliveries(req);
  }

  @Get("/{id}")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public getDeliveryById(@Path() id: string, @Request() req: ExpressRequest) {
    return DeliveryService.getDeliveryById(id, req);
  }

  @Post("/{id}/tracking")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public addDeliveryTracking(
    @Path() id: string,
    @Body() body: DeliveryTrackingDto,
    @Request() req: ExpressRequest,
  ) {
    return DeliveryService.addDeliveryTracking(id, body, req);
  }

  @Put("/{id}/cancel")
  @Middlewares(checkRole(...STAFF_OPS_ROLES))
  public cancelDelivery(
    @Path() id: string,
    @Body() body: CancelDeliveryDto,
    @Request() req: ExpressRequest,
  ) {
    const io = req.app.get("io");
    return DeliveryService.cancelDelivery(id, body.reason, req, io);
  }
}
