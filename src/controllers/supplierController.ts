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
import { SupplierService } from "../services/SupplierService";
import { checkRole } from "../middlewares";
import { STAFF_OPS_ROLES } from "../utils/roles";
import {
  CreateSupplierRequest,
  IResponse,
  IPaged,
  SupplierResponse,
  UpdateSupplierRequest,
} from "../utils/interfaces/common";

@Tags("Suppliers")
@Route("/api/suppliers")
@Security("jwt")
@Middlewares(checkRole(...STAFF_OPS_ROLES))
export class SupplierController {
  @Post("/")
  public async createSupplier(
    @Body() data: CreateSupplierRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<SupplierResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return SupplierService.createSupplier(data, companyId, branchId);
  }

  @Get("/{id}")
  public async getSupplier(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<SupplierResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return SupplierService.getSupplier(id, companyId, branchId);
  }

  @Put("/{id}")
  public async updateSupplier(
    @Path() id: string,
    @Body() data: UpdateSupplierRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<SupplierResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return SupplierService.updateSupplier(id, data, companyId, branchId);
  }

  @Delete("/{id}")
  public async deleteSupplier(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    await SupplierService.deleteSupplier(id, companyId, branchId);
    return {
      statusCode: 200,
      message: "Supplier deleted successfully",
      data: null,
    };
  }

  @Get("/")
  public async getSuppliers(
    @Request() req: ExpressRequest,
  ): Promise<IPaged<SupplierResponse[]>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    const { searchq, limit, page } = req.query as Record<string, string>;
    const currentPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;

    return SupplierService.getSuppliers(
      companyId,
      branchId,
      (searchq as string) || undefined,
      parsedLimit,
      currentPage,
    );
  }

  @Get("/by-company/{supplierCompanyId}")
  public async getSuppliersByCompany(
    @Path() supplierCompanyId: string,
  ): Promise<IResponse<SupplierResponse[]>> {
    return await SupplierService.getSuppliersByCompany(supplierCompanyId);
  }
}
