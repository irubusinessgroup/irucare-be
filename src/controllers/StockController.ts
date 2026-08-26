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
import AppError from "../utils/error";

@Security("jwt")
@Route("/api/stock-receipt")
@Tags("Stock")
export class StockController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getAllStock(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    const branchId = req.user?.branchId;
    return StockService.getAllStock(req, branchId, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getStockReceipt(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.getStockReceipt(id, companyId!, branchId);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public createStockReceipt(
    @Body() body: CreateStockDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.createStockReceipt(body, companyId!, branchId);
  }

  @Post("/manual")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public createManualStockReceipt(
    @Body() body: CreateManualStockReceiptDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.createManualStockReceipt(body, companyId!, branchId);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public updateStockReceipt(
    @Path() id: string,
    @Body() body: UpdateStockDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.updateStockReceipt(id, body, companyId!, branchId);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public deleteStockReceipt(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    return StockService.deleteStockReceipt(id, companyId!, branchId);
  }
}
