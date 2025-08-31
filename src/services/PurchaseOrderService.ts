import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from "../utils/interfaces/common";
import type { Request } from "express";
import { PONumberGenerator } from "../utils/PONumberGenerator ";
import { Prisma } from "@prisma/client";

export class PurchaseOrderService {
  // Merge duplicate items helper: combines items with same itemId, packSize and itemCode by summing quantities
  private static mergeItems(
    items: {
      itemId: string;
      packSize?: number | null;
      itemCode?: string | null;
      quantity?: number | string;
    }[],
  ): {
    itemId: string;
    packSize?: number | null;
    itemCode?: string | null;
    quantity: number;
  }[] {
    if (!items || !Array.isArray(items)) return [];
    const map = new Map<
      string,
      {
        itemId: string;
        packSize?: number | null;
        itemCode?: string | null;
        quantity: number;
      }
    >();

    for (const it of items) {
      // Ensure itemId exists; skip otherwise
      if (!it.itemId) continue;
      const key = `${it.itemId}:${it.packSize ?? ""}:${it.itemCode ?? ""}`;
      const qty = Number(it.quantity ?? 0);
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.quantity = existing.quantity + qty;
        map.set(key, existing);
      } else {
        map.set(key, {
          itemId: it.itemId,
          packSize: it.packSize ?? null,
          itemCode: it.itemCode ?? null,
          quantity: qty,
        });
      }
    }
    return Array.from(map.values());
  }

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
                some: {
                  item: {
                    itemFullName: { contains: searchq },
                  },
                },
              },
            },
            {
              items: {
                some: {
                  item: {
                    itemCodeSku: { contains: searchq },
                  },
                },
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
          include: {
            item: {
              select: {
                id: true,
                itemCodeSku: true,
                itemFullName: true,
                category: { select: { id: true, categoryName: true } },
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
        user: true,
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

  public static async getClientOrders(req: Request) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { searchq, page = 1, limit = 15 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const searchConditions = searchq
      ? {
          OR: [
            { poNumber: { contains: String(searchq) } },
            {
              items: {
                some: { item: { itemFullName: { contains: String(searchq) } } },
              },
            },
            {
              items: {
                some: { item: { itemCodeSku: { contains: String(searchq) } } },
              },
            },
          ],
        }
      : {};

    const pos = await prisma.purchaseOrder.findMany({
      where: {
        suppliers: { supplierCompanyId: companyId },
        // overallStatus: { in: ["NOT_YET", "SOME_APPROVED"] },
        ...searchConditions,
      },
      include: {
        items: { include: { item: true } },
        suppliers: true,
        company: true,
        user: true,
        processingEntries: true,
      },
      skip,
      take: Number(limit),
    });

    const totalItems = await prisma.purchaseOrder.count({
      where: {
        suppliers: { supplierCompanyId: companyId },
        overallStatus: { in: ["NOT_YET", "SOME_APPROVED"] },
        ...searchConditions,
      },
    });

    const supplierPerforma = pos.map((po) => ({
      poNumber: po.poNumber,
      poId: po.id,
      expectedDeliveryDate: po.expectedDeliveryDate,
      overallStatus: po.overallStatus,
      buyerCompany: po.company,
      user: po.user,
      supplier: po.suppliers,
      processingEntries: po.processingEntries,
      items: po.items.map((item) => ({
        ...item,
        remainingQuantity: null,
      })),
    }));

    return {
      message: "Client orders retrieved",
      data: supplierPerforma,
      totalItems,
      currentPage: Number(page),
      itemsPerPage: Number(limit),
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
        items: { include: { item: { include: { category: true } } } },
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
    req: Request,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }

    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    if (!data.items || data.items.length === 0) {
      throw new AppError("At least one item is required", 400);
    }

    // Merge duplicates (same itemId, packSize, itemCode) by summing quantities
    const mergedItems = PurchaseOrderService.mergeItems(data.items);
    if (!mergedItems || mergedItems.length === 0) {
      throw new AppError("At least one item is required", 400);
    }

    const supplier = await prisma.suppliers.findUnique({
      where: { id: data.supplierId, companyId },
    });

    if (!supplier) {
      throw new AppError("Supplier not found", 404);
    }

    const poNumber =
      data.poNumber || (await PONumberGenerator.generatePONumber(companyId));

    const existingPO = await prisma.purchaseOrder.findFirst({
      where: {
        poNumber,
        companyId,
      },
    });

    if (existingPO) {
      throw new AppError("Purchase order number already exists", 409);
    }

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        companyId,
        supplierId: data.supplierId,
        notes: data.notes,
        reqById: userId!,
        expectedDeliveryDate: data.expectedDeliveryDate,
        items: {
          create: mergedItems.map((item) => {
            const createObj = {
              itemId: item.itemId,
              quantity: Number(item.quantity),
              ...(item.packSize !== undefined && item.packSize !== null
                ? { packSize: item.packSize }
                : {}),
            } as Prisma.PurchaseOrderItemUncheckedCreateWithoutPurchaseOrderInput;

            return createObj;
          }),
        },
      },
      include: {
        suppliers: true,
        items: {
          include: {
            item: true,
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
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("User ID is missing", 400);
    }
    const companyId = req.user?.company?.companyId;
    if (!companyId) {
      throw new AppError("Company ID is missing", 400);
    }

    const existingPO = await prisma.purchaseOrder.findFirst({
      where: { id, companyId },
      include: { stockReceipts: true, items: true },
    });

    if (!existingPO) {
      throw new AppError("Purchase order not found", 404);
    }

    if (data.supplierId) {
      const supplier = await prisma.suppliers.findUnique({
        where: { id: data.supplierId, companyId },
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

    type POUpdateWithUser = Prisma.PurchaseOrderUpdateInput & {
      user?: { connect: { id: string } };
      suppliers?: { connect: { id: string } };
    };

    const updateData: POUpdateWithUser = {
      ...(data.poNumber && { poNumber: data.poNumber }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.expectedDeliveryDate && {
        expectedDeliveryDate: data.expectedDeliveryDate,
      }),
    };

    // If supplierId provided, use relation connect for the suppliers relation
    if (data.supplierId) {
      updateData.suppliers = { connect: { id: data.supplierId } };
    }

    if (data.items && data.items.length > 0) {
      // Merge duplicate items before saving
      const mergedItems = PurchaseOrderService.mergeItems(data.items);

      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      updateData.items = {
        create: mergedItems.map((item) => {
          const createObj = {
            itemId: item.itemId,
            quantity: Number(item.quantity),
            ...(item.packSize !== undefined && item.packSize !== null
              ? { packSize: item.packSize }
              : {}),
          } as Prisma.PurchaseOrderItemUncheckedCreateWithoutPurchaseOrderInput;

          return createObj;
        }),
      };
    }

    // If reqById is missing on the existing PO or different from the current user,
    // set it to the user performing the update.
    const shouldSetReqBy = !existingPO.reqById || existingPO.reqById !== userId;

    if (shouldSetReqBy) {
      updateData.user = { connect: { id: userId } };
    }

    const purchaseOrder = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            item: {
              select: {
                id: true,
                itemCodeSku: true,
                itemFullName: true,
              },
            },
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

  public static async getPurchaseOrderForStockReceipt(
    poNumber: string,
    companyId: string,
  ) {
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { poNumber, companyId },
      include: {
        items: {
          include: {
            item: true,
            stockReceipts: {
              select: { quantityReceived: true },
            },
          },
        },
        suppliers: true,
      },
    });

    if (!purchaseOrder) {
      throw new AppError("Purchase order not found", 404);
    }

    return purchaseOrder.items.map((item) => {
      const received = item.stockReceipts.reduce(
        (sum, sr) => sum + sr.quantityReceived.toNumber(),
        0,
      );
      const remaining = item.quantity.toNumber() - received;

      return {
        purchaseOrderItemId: item.id,
        itemId: item.itemId,
        itemName: item.item.itemFullName,
        sku: item.item.itemCodeSku,
        orderedQuantity: item.quantity.toNumber(),
        receivedQuantity: received,
        remainingQuantity: remaining,
        supplierId: purchaseOrder.supplierId,
        supplierName: purchaseOrder.suppliers.supplierName,
        packSize: item.packSize ? item.packSize.toNumber() : null,
      };
    });
  }
}
