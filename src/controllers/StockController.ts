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

@Security("jwt")
@Route("/api/stock")
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
  public getStock(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    return StockService.getStock(id, companyId!);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createStock(
    @Body() body: CreateStockDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return StockService.createStock(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateStock(
    @Path() id: string,
    @Body() body: UpdateStockDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return StockService.updateStock(id, body, companyId!);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteStock(@Path() id: string, @Request() req: ExpressRequest) {
    const companyId = req.user?.company?.companyId;
    return StockService.deleteStock(id, companyId!);
  }
}
