import {
  Body,
  Delete,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { StockService } from "../services/StockService";
import { CreateStockDto, UpdateStockDto } from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import { PurchaseOrderService } from "../services/PurchaseOrderService";
import AppError from "../utils/error";

@Security("jwt")
@Route("/api/stock-receipt")
@Tags("Stock")
export class StockController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllStock(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return StockService.getAllStock(req, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getStockReceipt(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    return StockService.getStockReceipt(id, companyId!);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createStockReceipt(
    @Body() body: CreateStockDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return StockService.createStockReceipt(body, companyId!);
  }

  // @Post("/bulk-from-po")
  // @Middlewares(checkRole(roles.COMPANY_ADMIN))
  // public createStockReceiptsFromPO(
  //   @Body() body: BulkCreateStockReceiptsDto,
  //   @Request() req: ExpressRequest,
  // ) {
  //   const companyId = req.user?.company?.companyId;
  //   if (!companyId) {
  //     throw new AppError("Company ID is missing", 400);
  //   }

  //   return StockService.createStockReceiptsFromPO(
  //     body.poNumber,
  //     body.receipts,
  //     companyId,
  //   );
  // }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateStockReceipt(
    @Path() id: string,
    @Body() body: UpdateStockDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return StockService.updateStockReceipt(id, body, companyId!);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteStockReceipt(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return StockService.deleteStockReceipt(id, companyId!);
  }

  @Get("/by-po/{poNumber}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getPurchaseOrderForStockReceipt(
    @Path() poNumber: string,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);
    return PurchaseOrderService.getPurchaseOrderForStockReceipt(
      poNumber,
      companyId,
    );
  }
}
