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
import { WarehouseService } from "../services/WarehouseService";
import {
  IPaged,
  IResponse,
  WarehouseResponse,
  CreateWarehouseRequest,
  UpdateWarehouseRequest,
} from "../utils/interfaces/common";

@Tags("Warehouses")
@Route("/api/warehouse")
export class WarehouseController {
  @Post("/")
  @Security("jwt")
  public async createWarehouse(
    @Body() data: CreateWarehouseRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<WarehouseResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return WarehouseService.createWarehouse(data, companyId, branchId);
  }

  @Get("/{warehouseId}")
  @Security("jwt")
  public async getWarehouseById(
    @Path() warehouseId: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<WarehouseResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return WarehouseService.getWarehouseById(warehouseId, companyId, branchId);
  }

  @Put("/{warehouseId}")
  @Security("jwt")
  public async updateWarehouse(
    @Path() warehouseId: string,
    @Body() data: UpdateWarehouseRequest,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<WarehouseResponse>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return WarehouseService.updateWarehouse(warehouseId, data, companyId, branchId);
  }

  @Delete("/{warehouseId}")
  @Security("jwt")
  public async deleteWarehouse(
    @Path() warehouseId: string,
    @Request() req: ExpressRequest,
  ): Promise<IResponse<null>> {
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;
    return WarehouseService.deleteWarehouse(warehouseId, companyId, branchId);
  }

  @Get("/")
  @Security("jwt")
  public async getWarehouse(
    @Request() req: ExpressRequest,
  ): Promise<IPaged<WarehouseResponse[]>> {
    const { searchq, limit, page } = req.query as Record<string, string>;
    const currentPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;
    const companyId = req.user?.company?.companyId as string;
    const branchId = req.user?.branchId;

    return WarehouseService.getWarehouse(
      companyId,
      branchId,
      (searchq as string) || undefined,
      parsedLimit,
      currentPage,
    );
  }
}
