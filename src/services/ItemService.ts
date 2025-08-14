import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateItemDto, UpdateItemDto } from "../utils/interfaces/common";
import { ItemCodeGenerator } from "../utils/itemCodeGenerator";
import type { Request } from "express";

export class ItemService {
  public static async createItem(data: CreateItemDto, companyId: string) {
    const category = await prisma.itemCategories.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      throw new AppError("Category not found", 404);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new AppError("Company not found", 404);
    }
    const itemCode = await ItemCodeGenerator.generate(data.categoryId);
    const item = await prisma.items.create({
      data: {
        ...data,
        itemCodeSku: itemCode,
        companyId: companyId,
        barcodeQrCode:
          typeof data.barcodeQrCode === "string"
            ? data.barcodeQrCode
            : undefined,
      },
      include: {
        category: true,
        company: true,
      },
    });

    return { message: "Item created successfully", data: item };
  }

  public static async getItem(id: string) {
    const item = await prisma.items.findUnique({
      where: { id },
      include: {
        category: true,
        company: true,
        stock: { include: { supplier: true } },
      },
    });
    if (!item) {
      throw new AppError("Item not found", 404);
    }

    const totalStockQuantity = item.stock.reduce(
      (sum, s) => sum + parseFloat(s.quantityReceived.toString()),
      0,
    );

    return {
      message: "Item fetched successfully",
      data: {
        ...item,
        totalStockQuantity,
      },
    };
  }

  public static async updateItem(
    id: string,
    data: UpdateItemDto,
    companyId: string,
  ) {
    const item = await prisma.items.findUnique({
      where: { id, companyId: companyId },
      include: {
        category: true,
        company: true,
        stock: { include: { supplier: true } },
      },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    if (data.categoryId) {
      const category = await prisma.itemCategories.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new AppError("Category not found", 404);
      }
    }

    const { barcodeQrCode, ...restData } = data;
    const updateData = {
      ...restData,
      barcodeQrCode:
        typeof barcodeQrCode === "string" ? barcodeQrCode : undefined,
    };

    const updatedItem = await prisma.items.update({
      where: { id, companyId: companyId },
      data: updateData,
      include: {
        category: true,
        company: true,
        stock: { include: { supplier: true } },
      },
    });

    return {
      message: "Item updated successfully",
      data: updatedItem,
    };
  }

  public static async deleteItem(id: string, companyId: string) {
    const item = await prisma.items.findUnique({
      where: { id, companyId: companyId },
      include: { stock: true },
    });

    if (!item) {
      throw new AppError("Item not found", 404);
    }

    if (item.stock.length > 0) {
      throw new AppError("Item has stock entries and cannot be deleted", 400);
    }

    await prisma.items.delete({
      where: { id },
    });

    return {
      message: "Item deleted successfully",
    };
  }

  public static async getItems(
    req: Request,
    searchq?: string,
    limit?: number,
    page?: number,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const queryOptions = searchq
      ? {
          companyId,
          OR: [
            { itemCodeSku: { contains: searchq } },
            { itemFullName: { contains: searchq } },
            { description: { contains: searchq } },
            { brandManufacturer: { contains: searchq } },
          ],
        }
      : { companyId };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const items = await prisma.items.findMany({
      where: queryOptions,
      include: {
        category: true,
        company: true,
        stock: { include: { supplier: true } },
      },
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.items.count({ where: queryOptions });

    return {
      data: items,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || items.length,
      message: "Items retrieved successfully",
    };
  }
}
