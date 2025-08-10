import { Body, Delete, Get, Path, Post, Put, Request, Route, Tags } from "tsoa";
import { Request as ExpressRequest } from "express";
import { ItemService } from "../services/ItemService";
import {
  CreateItemRequest,
  IPaged,
  IResponse,
  ItemFilters,
  ItemResponse,
  UpdateItemRequest,
} from "../utils/interfaces/common";

@Tags("Items")
@Route("/api/items")
export class ItemController {
  @Post("/")
  public async createItem(
    @Body() data: CreateItemRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<ItemResponse>> {
    const userId = req.user?.id as string;
    return ItemService.createItem(data, userId);
  }

  @Get("/{itemCode}")
  public async getItemByCode(
    @Path() itemCode: string
  ): Promise<IResponse<ItemResponse>> {
    return ItemService.getItemByCode(itemCode);
  }

  @Put("/{itemCode}")
  public async updateItem(
    @Path() itemCode: string,
    @Body() data: UpdateItemRequest,
    @Request() req: ExpressRequest
  ): Promise<IResponse<ItemResponse>> {
    const userId = req.user?.id as string;
    return ItemService.updateItem(itemCode, data, userId);
  }

  @Delete("/{itemCode}")
  public async deleteItem(@Path() itemCode: string): Promise<IResponse<null>> {
    return ItemService.deleteItem(itemCode);
  }

  @Get("/")
  public async getItems(
    @Request() req: ExpressRequest
  ): Promise<IPaged<ItemResponse[]>> {
    const { searchq, limit, page, category_id, is_active, barcode } =
      req.query as Record<string, string>;
    const currentPage = page ? parseInt(page as string, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit as string, 10) : undefined;

    const filters: ItemFilters = {
      category_id: category_id as string | undefined,
      is_active:
        typeof is_active !== "undefined" ? is_active === "true" : undefined,
      barcode: barcode as string | undefined,
    };

    return ItemService.getItems(
      (searchq as string) || undefined,
      parsedLimit,
      currentPage,
      filters
    );
  }
}
