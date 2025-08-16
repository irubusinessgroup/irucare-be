import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from "../utils/interfaces/common";
import type { Request } from "express";

export class PurchaseOrderService {
  public static async getAllPurchaseOrders(
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
            { poNumber: { contains: searchq } },
            {
              items: {
                itemFullName: { contains: searchq },
              },
            },
            {
              items: {
                itemCodeSku: { contains: searchq },
              },
            },
            {
              suppliers: {
                supplierName: { contains: searchq },
              },
            },
          ],
        }
      : { companyId };

    const skip = page && limit ? (page - 1) * limit : undefined;
    const take = limit;

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: queryOptions,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        items: {
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
        suppliers: {
          select: {
            id: true,
            supplierName: true,
            email: true,
            phoneNumber: true,
          },
        },
        stockReceipts: {
          select: {
            id: true,
            quantityReceived: true,
            dateReceived: true,
          },
        },
      },
    });

    const totalItems = await prisma.purchaseOrder.count({
      where: queryOptions,
    });

    return {
      data: purchaseOrders,
      totalItems,
      currentPage: page || 1,
      itemsPerPage: limit || purchaseOrders.length,
      message: "Purchase orders retrieved successfully",
    };
  }

  public static async getPurchaseOrderById(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: {
        items: {
          include: {
            category: true,
          },
        },
        suppliers: true,
        stockReceipts: {
          orderBy: { dateReceived: "desc" },
        },
      },
    });

    if (!purchaseOrder) {
      throw new AppError("Purchase order not found", 404);
    }

    return {
      data: purchaseOrder,
      message: "Purchase order retrieved successfully",
    };
  }

  public static async createPurchaseOrder(
    data: CreatePurchaseOrderDto,
    companyId: string,
  ) {
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const item = await prisma.items.findFirst({
      where: {
        id: data.itemId,
        companyId,
      },
    });

    if (!item) {
      throw new AppError(
        "Item not found or doesn't belong to your company",
        404,
      );
    }

    const supplier = await prisma.suppliers.findUnique({
      where: { id: data.supplierId, companyId },
    });

    if (!supplier) {
      throw new AppError("Supplier not found", 404);
    }

    const existingPO = await prisma.purchaseOrder.findFirst({
      where: {
        poNumber: data.poNumber,
        companyId,
      },
    });

    if (existingPO) {
      throw new AppError("Purchase order number already exists", 409);
    }

    const totalAmount = data.quantity * data.costPrice;

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        ...data,
        companyId,
        totalAmount,
      },
      include: {
        items: {
          select: {
            id: true,
            itemCodeSku: true,
            itemFullName: true,
          },
        },
        suppliers: {
          select: {
            id: true,
            supplierName: true,
            email: true,
          },
        },
      },
    });

    return {
      message: "Purchase order created successfully",
      data: purchaseOrder,
    };
  }

  public static async updatePurchaseOrder(
    id: string,
    data: UpdatePurchaseOrderDto,
    req: Request,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingPO = await prisma.purchaseOrder.findFirst({
      where: { id, companyId },
    });

    if (!existingPO) {
      throw new AppError("Purchase order not found", 404);
    }

    if (data.itemId) {
      const item = await prisma.items.findFirst({
        where: {
          id: data.itemId,
          companyId,
        },
      });

      if (!item) {
        throw new AppError(
          "Item not found or doesn't belong to your company",
          404,
        );
      }
    }

    if (data.supplierId) {
      const supplier = await prisma.suppliers.findUnique({
        where: { id: data.supplierId },
      });

      if (!supplier) {
        throw new AppError("Supplier not found", 404);
      }
    }

    if (data.poNumber && data.poNumber !== existingPO.poNumber) {
      const existingPOWithNumber = await prisma.purchaseOrder.findFirst({
        where: {
          poNumber: data.poNumber,
          companyId,
          id: { not: id },
        },
      });

      if (existingPOWithNumber) {
        throw new AppError("Purchase order number already exists", 409);
      }
    }

    const updateData = { ...data };
    if (data.quantity !== undefined || data.costPrice !== undefined) {
      const quantity = Number(data.quantity ?? existingPO.quantity);
      const costPrice = Number(data.costPrice ?? existingPO.costPrice);
      updateData.totalAmount = quantity * costPrice;
    }

    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          select: {
            id: true,
            itemCodeSku: true,
            itemFullName: true,
          },
        },
        suppliers: {
          select: {
            id: true,
            supplierName: true,
            email: true,
          },
        },
      },
    });

    return {
      message: "Purchase order updated successfully",
      data: purchaseOrder,
    };
  }

  public static async deletePurchaseOrder(id: string, req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingPO = await prisma.purchaseOrder.findFirst({
      where: { id, companyId },
    });

    if (!existingPO) {
      throw new AppError("Purchase order not found", 404);
    }

    const stockReceiptsCount = await prisma.stockReceipts.count({
      where: { purchaseOrderId: id },
    });

    if (stockReceiptsCount > 0) {
      throw new AppError(
        "Cannot delete purchase order with existing stock receipts",
        400,
      );
    }

    await prisma.purchaseOrder.delete({ where: { id } });
    return { message: "Purchase order deleted successfully" };
  }
}
