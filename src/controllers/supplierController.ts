import { Body, Delete, Get, Path, Post, Put, Request, Route, Tags } from "tsoa";
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
  public async createSupplier(
    @Body() data: CreateSupplierRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<SupplierResponse>> {
    const userId = req.user?.id as string;
    return SupplierService.createSupplier(data, userId);
  }

  @Get("/{id}")
  public async getSupplier(
    @Path() id: string
  ): Promise<IResponse<SupplierResponse>> {
    return SupplierService.getSupplier(id);
  }

  @Put("/{id}")
  public async updateSupplier(
    @Path() id: string,
    @Body() data: UpdateSupplierRequest
  ): Promise<IResponse<SupplierResponse>> {
    return SupplierService.updateSupplier(id, data);
  }

  @Delete("/{id}")
  public async deleteSupplier(@Path() id: string): Promise<IResponse<null>> {
    await SupplierService.deleteSupplier(id);
    return {
      statusCode: 200,
      message: "Supplier deleted successfully",
      data: null,
    };
  }

  @Get("/")
  public async getSuppliers(
    @Request() req: ExpressRequest
  ): Promise<IPaged<SupplierResponse[]>> {
    const { searchq, limit, page, is_active } = req.query as Record<
      string,
      string
    >;
    const currentPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;
    const isActive =
      typeof is_active !== "undefined" ? is_active === "true" : undefined;

    return SupplierService.getSuppliers(
      (searchq as string) || undefined,
      isActive,
      parsedLimit,
      currentPage
    );
  }
}

// import {
//   Body,
//   Get,
//   Post,
//   Put,
//   Delete,
//   Route,
//   Tags,
//   Path,
//   Security,
//   Request,
//   Query,
//   Middlewares,
// } from "tsoa";
// import { SupplierService } from "../services/SupplierService";
// import {
//   CreateSupplierDto,
//   UpdateSupplierDto,
// } from "../utils/interfaces/common";
// import { Request as ExpressRequest } from "express";
// import { roles } from "../utils/roles";
// import { checkRole } from "../middlewares";

// @Security("jwt")
// @Route("/api/suppliers")
// @Tags("Suppliers")
// export class SupplierController {
//   @Get("/")
//   @Middlewares(checkRole(roles.COMPANY_ADMIN))
//   public getAllSuppliers(
//     @Request() req: ExpressRequest,
//     @Query() searchq?: string,
//     @Query() limit?: number,
//     @Query() page?: number,
//   ) {
//     return SupplierService.getAllSuppliers(req, searchq, limit, page);
//   }

//   @Post("/")
//   @Middlewares(checkRole(roles.COMPANY_ADMIN))
//   public createSupplier(
//     @Body() body: CreateSupplierDto,
//     @Request() req: ExpressRequest,
//   ) {
//     const companyId = req.user?.company?.companyId;
//     return SupplierService.createSupplier(body, companyId!);
//   }

//   @Put("/{id}")
//   @Middlewares(checkRole(roles.COMPANY_ADMIN))
//   public updateSupplier(@Path() id: string, @Body() body: UpdateSupplierDto) {
//     return SupplierService.updateSupplier(id, body);
//   }

//   @Delete("/{id}")
//   @Middlewares(checkRole(roles.COMPANY_ADMIN))
//   public deleteSupplier(@Path() id: string) {
//     return SupplierService.deleteSupplier(id);
//   }
// }
