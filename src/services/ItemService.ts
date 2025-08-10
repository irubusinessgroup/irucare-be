import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreateItemRequest,
  IPaged,
  IResponse,
  ItemFilters,
  ItemResponse,
  UpdateItemRequest,
} from "../utils/interfaces/common";
import { ItemCodeGenerator } from "../utils/itemCodeGenerator";
import { Paginations, QueryOptions } from "../utils/DBHelpers";

export class ItemService {
  static async createItem(
    data: CreateItemRequest,
    userId: string
  ): Promise<IResponse<ItemResponse>> {
    const category = await prisma.itemCategories.findUnique({
      where: { id: data.category_id },
    });

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    const uom = await prisma.unitsOfMeasure.findUnique({
      where: { id: data.uom_id },
    });

    if (!uom) {
      throw new AppError("Unit of measure not found", 404);
    }

    const tempReq = await prisma.temperatureRequirements.findUnique({
      where: { id: data.temp_req_id },
    });

    if (!tempReq) {
      throw new AppError("Temperature requirement not found", 404);
    }

    const existingBarcode = await prisma.items.findFirst({
      where: { barcode_qr_code: data.barcode_qr_code },
    });

    if (existingBarcode) {
      throw new AppError("Item with this barcode already exists", 404);
    }

    const itemCode = await ItemCodeGenerator.generate(data.category_id);

    const item = await prisma.items.create({
      data: {
        ...data,
        item_code_sku: itemCode,
        created_by_user_id: userId,
      },
      include: { category: true, uom: true, temp: true },
    });

    return {
      statusCode: 201,
      message: "Item created successfully",
      data: this.mapToItemResponse(item),
    };
  }

  static async getItemByCode(
    itemCode: string
  ): Promise<IResponse<ItemResponse>> {
    const item = await prisma.items.findUnique({
      where: { item_code_sku: itemCode },
      include: {
        category: true,
        uom: true,
        stockReciepts: { include: { stockBatches: true } },
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    const itemResponse = this.mapToItemResponse(item);

    itemResponse.current_stock = item.stockReciepts.reduce((total, receipt) => {
      const batchStock = receipt.stockBatches.reduce((batchTotal, batch) => {
        return batchTotal + parseFloat(batch.current_stock_quantity.toString());
      }, 0);
      return total + batchStock;
    }, 0);

    return {
      statusCode: 200,
      message: "Item fetched successfully",
      data: itemResponse,
    };
  }

  static async updateItem(
    itemCode: string,
    data: UpdateItemRequest,
    userId: string
  ): Promise<IResponse<ItemResponse>> {
    const existingItem = await prisma.items.findUnique({
      where: { item_code_sku: itemCode },
      include: {
        category: true,
        uom: true,
        stockReciepts: { include: { stockBatches: true } },
      },
    });

    if (!existingItem) {
      throw new AppError("Item not found", 404);
    }

    if (data.category_id) {
      const category = await prisma.itemCategories.findUnique({
        where: { id: data.category_id },
      });
      if (!category) {
        throw new AppError("Category not found", 404);
      }
    }

    if (data.uom_id) {
      const uom = await prisma.unitsOfMeasure.findUnique({
        where: { id: data.uom_id },
      });
      if (!uom) {
        throw new AppError("Unit of measure not found", 404);
      }
    }

    if (data.temp_req_id) {
      const tempReq = await prisma.temperatureRequirements.findUnique({
        where: { id: data.temp_req_id },
      });
      if (!tempReq) {
        throw new AppError("Temperature requirement not found", 404);
      }
    }

    if (
      data.barcode_qr_code &&
      data.barcode_qr_code !== existingItem.barcode_qr_code
    ) {
      const existingBarcode = await prisma.items.findFirst({
        where: {
          barcode_qr_code: data.barcode_qr_code,
          NOT: { item_code_sku: itemCode },
        },
      });
      if (existingBarcode) {
        throw new AppError("Item with this barcode already exists", 404);
      }
    }

    const updatedItem = await prisma.items.update({
      where: { item_code_sku: itemCode },
      data: {
        ...data,
        updated_by_user_id: userId,
      },
      include: {
        category: true,
        uom: true,
        temp: true,
      },
    });

    return {
      statusCode: 200,
      message: "Item updated successfully",
      data: this.mapToItemResponse(updatedItem),
    };
  }

  static async deleteItem(itemCode: string): Promise<IResponse<null>> {
    const item = await prisma.items.findUnique({
      where: { item_code_sku: itemCode },
      include: {
        stockReciepts: true,
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    if (item.stockReciepts.length > 0) {
      throw new AppError(
        "Cannot delete item with existing stock receipts",
        404
      );
    }

    await prisma.items.delete({
      where: { item_code_sku: itemCode },
    });

    return {
      statusCode: 2000,
      message: "item deleted successfully",
    };
  }

  static async getItems(
    searchq?: string,
    limit?: number,
    currentPage?: number,
    filters: ItemFilters = {}
  ): Promise<IPaged<ItemResponse[]>> {
    try {
      const searchOptions = QueryOptions(
        ["item_code_sku", "item_full_name", "description"],
        searchq
      );

      const where: any = {
        ...searchOptions,
      };

      if (filters.category_id) {
        where.category_id = filters.category_id;
      }

      if (filters.is_active !== undefined) {
        where.is_active = filters.is_active;
      }

      if (filters.barcode) {
        where.barcode_qr_code = filters.barcode;
      }

      const pagination = Paginations(currentPage, limit);

      const items = await prisma.items.findMany({
        where,
        ...pagination,
        orderBy: { created_at: "desc" },
        include: {
          category: true,
          uom: true,
          temp: true,
        },
      });

      const totalItems = await prisma.items.count({ where });

      const data = items.map((item) => this.mapToItemResponse(item));

      return {
        statusCode: 200,
        message: "Items fetched successfully",
        data,
        totalItems,
        currentPage: currentPage || 1,
        itemsPerPage: limit || 10,
      };
    } catch (error) {
      throw new AppError(error, 500);
    }
  }

  private static mapToItemResponse(item: any): ItemResponse {
    return {
      id: item.id,
      item_code_sku: item.item_code_sku,
      item_full_name: item.item_full_name,
      category: {
        id: item.category.id,
        category_name: item.category.category_name,
        description: item.category.description,
      },
      description: item.description,
      brand_manufacturer: item.brand_manufacturer,
      barcode_qr_code: item.barcode_qr_code,
      pack_size: item.pack_size
        ? parseFloat(item.pack_size.toString())
        : undefined,
      uom: {
        id: item.uom.id,
        uom_name: item.uom.uom_name,
        abbreviation: item.uom.abbreviation,
      },
      temp: {
        id: item.temp.id,
        temp_req_name: item.temp.temp_req_name,
        min_temp_celsius: item.temp.min_temp_celsius
          ? parseFloat(item.temp.min_temp_celsius.toString())
          : undefined,
        max_temp_celsius: item.temp.max_temp_celsius
          ? parseFloat(item.temp.max_temp_celsius.toString())
          : undefined,
      },
      is_active: item.is_active,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }
}
