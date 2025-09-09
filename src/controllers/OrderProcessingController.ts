import {
  Body,
  Delete,
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
  CreateProcessingEntryDto,
  ApproveItemsDto,
} from "../utils/interfaces/common";
import { OrderProcessingService } from "../services/PurchaseOrderProcessingService";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";

type AuthRequest = ExpressRequest & {
  user?: { company?: { companyId?: string } };
};

@Security("jwt")
@Route("/api/purchase-orders/processing")
@Tags("Purchase Order Processing")
export class OrderProcessingController {
  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public create(
    @Body() body: CreateProcessingEntryDto,
    @Request() req: AuthRequest,
  ) {
    return OrderProcessingService.createUpdateProcessingDraft(body, req);
  }

  @Get("/performa")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getRecivedPerforma(@Request() req: AuthRequest) {
    return OrderProcessingService.getSupplierPerforma(req);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public delete(@Path() id: string, @Request() req: AuthRequest) {
    return OrderProcessingService.deleteProcessingEntry(id, req);
  }

  @Put("/{id}/complete")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public complete(@Path() id: string, @Request() req: AuthRequest) {
    return OrderProcessingService.completeAndSend(id, req);
  }

  @Put("/po/{poNumber}/approve")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public approveItems(
    @Path() poNumber: string,
    @Body() body: ApproveItemsDto,
    @Request() req: AuthRequest,
  ) {
    return OrderProcessingService.approveItems(poNumber, body, req);
  }

  @Get("/client/performa")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getClientPerforma(@Request() req: AuthRequest) {
    return OrderProcessingService.getClientPerforma(req);
  }

  @Get("/supplier/performa")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getSupplierPerforma(@Request() req: AuthRequest) {
    return OrderProcessingService.getSupplierPerforma(req);
  }

  @Get("/po/{poNumber}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getOrderByPONumber(
    @Path() poNumber: string,
    @Request() req: AuthRequest,
  ) {
    return OrderProcessingService.getOrdersByPONumber(poNumber, req);
  }

  @Get("/processed-items")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getProcessedItems(@Request() req: AuthRequest) {
    return OrderProcessingService.getProcessedItems(req);
  }
}
