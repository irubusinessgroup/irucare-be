import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { CreateSellDto, UpdateSellDto } from "../utils/interfaces/common";
import type { Request } from "express";

export class SellService {
  public static async getAllSells(
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
            {
              client: {
                name: { contains: searchq },
              },
            },
            {
              item: {
                itemFullName: { contains: searchq },
              },
            },
            {
              item: {
                itemCodeSku: { contains: searchq },
              },
            },
          ],
        }
      : { companyId };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const sells = await prisma.sell.findMany({
      where: queryOptions,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        item: {
          select: {
            id: true,
            itemCodeSku: true,
            itemFullName: true,
            category: {
              select: {
                id: true,
                categoryName: true,
              },
            },
          },
        },
      },
    });

    const totalItems = await prisma.sell.count({ where: queryOptions });

    return {
      data: sells,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || sells.length,
      message: "Sales records retrieved successfully",
    };
  }

  public static async getSellById(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const sell = await prisma.sell.findFirst({
      where: { id, companyId },
      include: {
        client: true,
        item: {
          include: {
            category: true,
          },
        },
      },
    });

    if (!sell) {
      throw new AppError("Sale record not found", 404);
    }

    return {
      data: sell,
      message: "Sale record retrieved successfully",
    };
  }

  public static async createSell(data: CreateSellDto, companyId: string) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    return await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({
        where: { id: data.clientId, companyId },
      });
      if (!client) {
        throw new AppError(
          "Client not found or doesn't belong to your company",
          404,
        );
      }

      const item = await tx.items.findFirst({
        where: { id: data.itemId, companyId },
      });
      if (!item) {
        throw new AppError(
          "Item not found or doesn't belong to your company",
          404,
        );
      }

      const availableStock = await tx.stock.findMany({
        where: {
          stockReceipt: { itemId: data.itemId, companyId },
          status: "AVAILABLE",
        },
        include: {
          stockReceipt: {
            select: {
              id: true,
              expiryDate: true,
              dateReceived: true,
            },
          },
        },
        orderBy: [
          { stockReceipt: { expiryDate: "asc" } },
          { stockReceipt: { dateReceived: "asc" } },
        ],
      });

      if (availableStock.length < data.quantity) {
        throw new AppError(
          `Insufficient stock. Available: ${availableStock.length}, Requested: ${data.quantity}`,
          400,
        );
      }

      if (availableStock.length === 0) {
        throw new AppError("No available stock for this item", 400);
      }

      const stockToUpdate = availableStock.slice(0, data.quantity);
      const stockIds = stockToUpdate.map((stock) => stock.id);

      const totalAmount = data.quantity * data.sellPrice;
      const sell = await tx.sell.create({
        data: {
          ...data,
          companyId,
          totalAmount,
        },
        include: {
          client: { select: { id: true, name: true, email: true } },
          item: { select: { id: true, itemCodeSku: true, itemFullName: true } },
        },
      });

      await tx.stock.updateMany({
        where: { id: { in: stockIds } },
        data: {
          status: "SOLD",
          sellId: sell.id,
        },
      });

      return { message: "Sale created successfully", data: sell };
    });
  }

  public static async updateSell(
    id: string,
    data: UpdateSellDto,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    return await prisma.$transaction(async (tx) => {
      const existingSell = await tx.sell.findFirst({
        where: { id, companyId },
        include: {
          stocks: true,
        },
      });

      if (!existingSell) {
        throw new AppError("Sale record not found", 404);
      }

      if (data.clientId) {
        const client = await tx.client.findFirst({
          where: { id: data.clientId, companyId },
        });
        if (!client) {
          throw new AppError(
            "Client not found or doesn't belong to your company",
            404,
          );
        }
      }

      const oldItemId = existingSell.itemId;
      const oldQuantity = Number(existingSell.quantity);
      const newItemId = data.itemId ?? oldItemId;
      const newQuantity = Number(data.quantity ?? oldQuantity);

      const itemCheck = await tx.items.findFirst({
        where: { id: newItemId, companyId },
      });
      if (!itemCheck) {
        throw new AppError(
          "Item not found or doesn't belong to your company",
          404,
        );
      }

      if (newItemId !== oldItemId || newQuantity !== oldQuantity) {
        await tx.stock.updateMany({
          where: { sellId: id },
          data: {
            status: "AVAILABLE",
            sellId: null,
          },
        });

        if (newQuantity > 0) {
          const availableStock = await tx.stock.findMany({
            where: {
              stockReceipt: { itemId: newItemId },
              status: "AVAILABLE",
            },
            orderBy: [
              { stockReceipt: { expiryDate: "asc" } },
              { stockReceipt: { dateReceived: "asc" } },
            ],
          });

          if (availableStock.length < newQuantity) {
            throw new AppError(
              `Insufficient stock. Available: ${availableStock.length}, Requested: ${newQuantity}`,
              400,
            );
          }

          const stockToAllocate = availableStock.slice(0, newQuantity);
          await tx.stock.updateMany({
            where: { id: { in: stockToAllocate.map((s) => s.id) } },
            data: {
              status: "SOLD",
              sellId: id,
            },
          });
        }
      }

      const updateData = { ...data };
      if (data.quantity !== undefined || data.sellPrice !== undefined) {
        const quantity = Number(data.quantity ?? oldQuantity);
        const sellPrice = Number(data.sellPrice ?? existingSell.sellPrice);
        updateData.totalAmount = quantity * sellPrice;
      }

      const sell = await tx.sell.update({
        where: { id },
        data: updateData,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          item: {
            select: {
              id: true,
              itemCodeSku: true,
              itemFullName: true,
            },
          },
        },
      });

      return { message: "Sale updated successfully", data: sell };
    });
  }

  public static async deleteSell(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingSell = await prisma.sell.findFirst({
      where: { id, companyId },
    });

    if (!existingSell) {
      throw new AppError("Sale record not found", 404);
    }

    await prisma.sell.delete({ where: { id } });
    return { message: "Sale deleted successfully" };
  }
}
