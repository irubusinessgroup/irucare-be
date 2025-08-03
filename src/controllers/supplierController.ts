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
import { SupplierService } from "../services/SupplierService";
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from "../utils/interfaces/common";
import { Request as ExpressRequest } from "express";
import { roles } from "../utils/roles";
import { checkRole } from "../middlewares";

@Security("jwt")
@Route("/api/suppliers")
@Tags("Suppliers")
export class SupplierController {
  @Get("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public getAllSuppliers(
    @Request() req: ExpressRequest,
    @Query() searchq?: string,
    @Query() limit?: number,
    @Query() page?: number,
  ) {
    return SupplierService.getAllSuppliers(req, searchq, limit, page);
  }

  @Post("/")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public createSupplier(
    @Body() body: CreateSupplierDto,
    @Request() req: ExpressRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    return SupplierService.createSupplier(body, companyId!);
  }

  @Put("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public updateSupplier(@Path() id: string, @Body() body: UpdateSupplierDto) {
    return SupplierService.updateSupplier(id, body);
  }

  @Delete("/{id}")
  @Middlewares(checkRole(roles.COMPANY_ADMIN))
  public deleteSupplier(@Path() id: string) {
    return SupplierService.deleteSupplier(id);
  }
}
