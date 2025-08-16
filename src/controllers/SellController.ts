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
import { SellService } from "../services/SellService";
import { CreateSellDto, UpdateSellDto } from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/sells")
@Tags("Sell")
export class SellController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllSells(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return SellService.getAllSells(req, searchq, limit, page);
  }

  @Get("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getSellById(@Path() id: string, @Request() req: ExpressRequest) {
    return SellService.getSellById(id, req);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createSell(
    @Body() body: CreateSellDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return SellService.createSell(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateSell(
    @Path() id: string,
    @Body() body: UpdateSellDto,
    @Request() req: ExpressRequest,
  ) {
    return SellService.updateSell(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteSell(@Path() id: string, @Request() req: ExpressRequest) {
    return SellService.deleteSell(id, req);
  }
}
