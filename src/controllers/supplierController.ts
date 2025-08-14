import {
  Body,
  Delete,
  Get,
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
import {
  CreateSupplierRequest,
  IResponse,
  IPaged,
  SupplierResponse,
  UpdateSupplierRequest,
} from "../utils/interfaces/common";

@Tags("Suppliers")
@Route("/api/suppliers")
export class SupplierController {
  @Post("/")
  @Security("jwt")
  public async createSupplier(
    @Body() data: CreateSupplierRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<SupplierResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return SupplierService.createSupplier(data, companyId);
  }

  @Get("/{id}")
  @Security("jwt")
  public async getSupplier(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<SupplierResponse>> {
    const companyId = req.user?.company?.companyId as string;
    return SupplierService.getSupplier(id, companyId);
  }

  @Put("/{id}")
  @Security("jwt")
  public async updateSupplier(
    @Path() id: string,
    @Body() data: UpdateSupplierRequest,
  ): Promise<IResponse<SupplierResponse>> {
    return SupplierService.updateSupplier(id, data);
  }

  @Delete("/{id}")
  @Security("jwt")
  public async deleteSupplier(@Path() id: string): Promise<IResponse<null>> {
    await SupplierService.deleteSupplier(id);
    return {
      statusCode: 200,
      message: "Supplier deleted successfully",
      data: null,
    };
  }

  @Get("/")
  @Security("jwt")
  public async getSuppliers(
    @Request() req: ExpressRequest,
  ): Promise<IPaged<SupplierResponse[]>> {
    const companyId = req.user?.company?.companyId as string;
    const { searchq, limit, page } = req.query as Record<string, string>;
    const currentPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;

    return SupplierService.getSuppliers(
      companyId,
      (searchq as string) || undefined,
      parsedLimit,
      currentPage,
    );
  }
}
