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
import {
  CreateStockDto,
  UpdateStockDto,
  CreateManualStockReceiptDto,
} from "../utils/interfaces/common";
import { checkRole } from "../middlewares";
import { roles } from "../utils/roles";
import { PurchaseOrderService } from "../services/PurchaseOrderService";
import AppError from "../utils/error";

@Security("jwt")
@Route("/api/stock-receipt")
@Tags("Stock")
export class StockController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getAllStock(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number
  ) {
    const branchId = req.user?.branchId;
    return StockService.getAllStock(req, branchId, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getStockReceipt(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.getStockReceipt(id, companyId!, branchId);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public createStockReceipt(
    @Body() body: CreateStockDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.createStockReceipt(body, companyId!, branchId);
  }

  @Post("/manual")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public createManualStockReceipt(
    @Body() body: CreateManualStockReceiptDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.createManualStockReceipt(body, companyId!, branchId);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public updateStockReceipt(
    @Path() id: string,
    @Body() body: UpdateStockDto,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.updateStockReceipt(id, body, companyId!, branchId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public deleteStockReceipt(
    @Path() id: string,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.deleteStockReceipt(id, companyId!, branchId);
  }

  @Get("/by-po/{poNumber}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN))
  public getPurchaseOrderForStockReceipt(
    @Path() poNumber: string,
    @Request() req: ExpressRequest
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) throw new AppError("Company ID is missing", 400);
    return PurchaseOrderService.getPurchaseOrderForStockReceipt(
      poNumber,
      companyId,
      branchId
    );
  }
}
