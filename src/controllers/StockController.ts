import {
  Body,
  Delete,
  Get,
  Path,
  Post,
  Put,
  Query,
  Request,
  Route,
  Tags,
} from "tsoa";
import { Request as ExpressRequest } from "express";
import { StockService } from "../services/StockService";
import {
  CreateStockEntryRequest,
  IResponse,
  StockEntryFilters,
  StockEntryResponse,
  InventoryItem,
  ExpiringItem,
  IPaged,
} from "../utils/interfaces/common";
import AppError from "../utils/error";

@Tags("Stock")
@Route("/api/stock")
export class StockController {
  @Post("/receipts")
  public async createStockEntry(
    @Body() data: CreateStockEntryRequest,
    @Request() req: ExpressRequest
  ): Promise<StockEntryResponse> {
    const registeredByUserId = req.user?.id as string;
    const receivedByUserId = req.user?.id as string;
    return StockService.createStockEntry(
      data,
      registeredByUserId,
      receivedByUserId
    );
  }

  @Put("/receipts/{id}")
  public async updateStockEntry(
    @Path() id: string,
    @Body() data: Partial<CreateStockEntryRequest>,
    @Request() req: ExpressRequest
  ): Promise<IResponse<StockEntryResponse>> {
    const updatedByUserId = req.user?.id as string;
    return StockService.updateStockEntry(id, data, updatedByUserId);
  }

  @Get("/receipts/{id}")
  public async getStockEntry(
    @Path() id: string
  ): Promise<IResponse<StockEntryResponse>> {
    return StockService.getStockEntry(id);
  }

  @Delete("/receipts/{id}")
  public async deleteItem(@Path() id: string): Promise<void> {
    StockService.deleteStockEntry(id);
  }

  @Get("/receipts")
  public async getStockEntries(
    @Query() item_id?: string,
    @Query() supplier_id?: string,
    @Query() date_from?: string,
    @Query() date_to?: string,
    @Query() condition_id?: string,
    @Query() page: number = 1,
    @Query() limit: number = 10
  ): Promise<IPaged<StockEntryResponse[]>> {
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 100);

    const filters: StockEntryFilters = {};

    if (item_id) {
      filters.item_id = item_id;
    }

    if (supplier_id) {
      filters.supplier_id = supplier_id;
    }

    if (date_from) {
      try {
        filters.date_from = new Date(date_from);

        if (isNaN(filters.date_from.getTime())) {
          return {
            data: [],
            totalItems: 0,
            currentPage: validatedPage,
            itemsPerPage: validatedLimit,
            statusCode: 400,
            message: "Invalid date_from format. Use YYYY-MM-DD format.",
          };
        }
      } catch (error) {
        return {
          data: [],
          totalItems: 0,
          currentPage: validatedPage,
          itemsPerPage: validatedLimit,
          statusCode: 400,
          message: "Invalid date_from format. Use YYYY-MM-DD format.",
        };
      }
    }

    if (date_to) {
      try {
        filters.date_to = new Date(date_to);

        filters.date_to.setHours(23, 59, 59, 999);

        if (isNaN(filters.date_to.getTime())) {
          return {
            data: [],
            totalItems: 0,
            currentPage: validatedPage,
            itemsPerPage: validatedLimit,
            statusCode: 400,
            message: "Invalid date_to format. Use YYYY-MM-DD format.",
          };
        }
      } catch (error) {
        return {
          data: [],
          totalItems: 0,
          currentPage: validatedPage,
          itemsPerPage: validatedLimit,
          statusCode: 400,
          message: "Invalid date_to format. Use YYYY-MM-DD format.",
        };
      }
    }

    if (
      filters.date_from &&
      filters.date_to &&
      filters.date_from > filters.date_to
    ) {
      return {
        data: [],
        totalItems: 0,
        currentPage: validatedPage,
        itemsPerPage: validatedLimit,
        statusCode: 400,
        message: "date_from cannot be greater than date_to.",
      };
    }

    if (condition_id) {
      filters.condition_id = condition_id;
    }

    try {
      const result = await StockService.getStockEntries(
        filters,
        validatedPage,
        validatedLimit
      );

      return result;
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  @Get("/inventory")
  public async getInventory(): Promise<InventoryItem[]> {
    return new StockService().getInventory();
  }

  @Get("/expiring")
  public async getExpiringItems(
    @Query() days?: number
  ): Promise<ExpiringItem[]> {
    return new StockService().getExpiringItems(days);
  }
}
