import {
  Body,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Route,
  Tags,
  Path,
  Security,
  Request,
  Query,
  Middlewares,
} from "tsoa";
import { SellService } from "../services/SellService";
import {
  CreateSellDto,
  UpdateSellDto,
  SellType,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/sells")
@Tags("Sell")
export class SellController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getAllSells(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
    @Query() type?: SellType,
    @Query() isTrainingMode?: boolean,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
    @Query() paymentMode?: string,
  ) {
    return SellService.getAllSells(
      req,
      searchq,
      limit,
      page,
      type,
      isTrainingMode,
      dateFrom,
      dateTo,
      paymentMode,
    );
  }

  /** Export-only — no pagination, returns all sells matching filters. */
  @Get("/export")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public exportAllSells(
    @Request() req: ExpressRequest,
    @Query() type?: SellType,
    @Query() isTrainingMode?: boolean,
    @Query() dateFrom?: string,
    @Query() dateTo?: string,
    @Query() paymentMode?: string,
  ) {
    return SellService.getAllSellsForExport(
      req,
      type,
      isTrainingMode,
      dateFrom,
      dateTo,
      paymentMode,
    );
  }

  @Get("/sales-report")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getSalesReport(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() type?: string,
  ) {
    return SellService.getSalesReport(req, startDate, endDate, type);
  }

  /** Lookup a normal sale by tax invoice number (invcNo) for delivery planning */
  @Get("/by-invoice/{invoiceNumber}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getSellByInvoice(
    @Path() invoiceNumber: string,
    @Request() req: ExpressRequest,
  ) {
    return SellService.getSellByInvoiceNumber(invoiceNumber, req);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public getSellById(@Path() id: string, @Request() req: ExpressRequest) {
    return SellService.getSellById(id, req);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public async createSell(
    @Body() body: CreateSellDto,
    @Request() req: ExpressRequest,
  ) {
    return SellService.createSell(body, req);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public updateSell(
    @Path() id: string,
    @Body() body: UpdateSellDto,
    @Request() req: ExpressRequest,
  ) {
    return SellService.updateSell(id, body, req);
  }

  @Patch("/{id}/mark-copy")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public markSellAsCopy(@Path() id: string, @Request() req: ExpressRequest) {
    return SellService.markAsCopy(id, req);
  }

  @Post("/{id}/mark-copy")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public markSellAsCopyPost(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ) {
    return SellService.markAsCopy(id, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN, roles.BRANCH_ADMIN, roles.STAFF))
  public deleteSell(@Path() id: string, @Request() req: ExpressRequest) {
    return SellService.deleteSell(id, req);
  }
}
