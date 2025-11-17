import { prisma } from "../utils/client";
import AppError from "../utils/error";
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  PurchaseOrderItemDto,
  CreateClientOrderDto,
  UpdateClientOrderDto,
} from "../utils/interfaces/common";
import type { Request } from "express";
import { PONumberGenerator } from "../utils/PONumberGenerator ";
import { Prisma } from "@prisma/client";
import { NotificationHelper } from "../utils/notificationHelper";
import { Server as SocketIOServer } from "socket.io";
import { getSupplierOrThrow } from "../utils/validators";

export class PurchaseOrderService {
  // Helper method to send purchase order notifications
  private static async sendPurchaseOrderNotification(
    purchaseOrder: Prisma.PurchaseOrderGetPayload<{
      include: {
        suppliers: true;
        items: { include: { item: true } };
      };
    }>,
    buyerCompanyId: string,
    io: SocketIOServer,
  ): Promise<void> {
    if (!purchaseOrder?.suppliers?.supplierCompanyId) {
      return;
    }

    const buyerCompanyName =
      await NotificationHelper.getCompanyName(buyerCompanyId);

    await NotificationHelper.sendToCompany(
      io,
      purchaseOrder.suppliers.supplierCompanyId,
      "New Purchase Order",
      `New purchase order ${purchaseOrder.poNumber} from ${buyerCompanyName}`,
      "info",
      `/dashboard/purchase-orders/${purchaseOrder.id}`,
      "purchase_order",
      purchaseOrder.id,
      {
        poNumber: purchaseOrder.poNumber,
        buyerCompany: buyerCompanyName,
        supplierCompany: purchaseOrder.suppliers.supplierName,
        expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
      },
    );
  }

  // Merge duplicate items helper: combines items with same itemId and packSize by summing quantities
  private static mergeItems(items: PurchaseOrderItemDto[]): {
    itemId: string;
    packSize?: number | null;
    quantity: number;
  }[] {
    if (!items || !Array.isArray(items)) return [];
    const map = new Map<
      string,
      {
        itemId: string;
        packSize?: number | null;
        quantity: number;
      }
    >();

    for (const it of items) {
      if (!it.itemId) continue;
      const key = `${it.itemId}:${it.packSize ?? ""}`;
      const qty = Number(it.quantity ?? 0);
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.quantity = existing.quantity + qty;
        map.set(key, existing);
      } else {
        map.set(key, {
          itemId: it.itemId,
          packSize: it.packSize ?? null,
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
        client: true,
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
      clientAddress: po.clientAddress,
      reqClient: po.client,
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
    io?: SocketIOServer,
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

    await getSupplierOrThrow(data.supplierId, companyId);

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

    // Send notification to supplier company users if io is provided
    if (io && purchaseOrder.suppliers?.supplierCompanyId) {
      try {
        await this.sendPurchaseOrderNotification(purchaseOrder, companyId, io);
      } catch (error) {
        console.error("Error sending purchase order notification:", error);
        // Don't throw error here - notification failure shouldn't break the main flow
      }
    }

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
      await getSupplierOrThrow(data.supplierId, companyId);
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

  public static async createClientOrder(
    data: CreateClientOrderDto,
    req: Request,
  ) {
    const sellerCompanyId = req.user?.company?.companyId;
    if (!sellerCompanyId) {
      throw new AppError("Seller company ID is missing", 400);
    }

    // Resolve the Suppliers record that represents the seller company
    let supplierRecord = await prisma.suppliers.findFirst({
      where: {
        OR: [
          { supplierCompanyId: sellerCompanyId },
          { companyId: sellerCompanyId },
        ],
      },
    });

    // If not found, create a supplier profile for the seller company (we are acting as supplier)
    if (!supplierRecord) {
      const company = await prisma.company.findUnique({
        where: { id: sellerCompanyId },
      });

      if (!company) {
        throw new AppError("Seller company not found", 400);
      }

      const currentUserId = req.user?.id;
      let currentUser = null;
      if (currentUserId) {
        currentUser = await prisma.user.findUnique({
          where: { id: currentUserId },
        });
      }

      supplierRecord = await prisma.suppliers.create({
        data: {
          supplierName: company.name,
          contactPerson: currentUser
            ? `${currentUser.firstName ?? ""} ${currentUser.lastName ?? ""}`.trim()
            : company.name,
          phoneNumber: company.phoneNumber || "",
          email: company.email || `supplier-${company.id}@example.com`,
          address: company.website || "",
          companyId: sellerCompanyId,
          supplierCompanyId: sellerCompanyId,
        },
      });
    }

    const clientId = data.clientId;
    if (!clientId) {
      throw new AppError("Client ID is required", 400);
    }

    if (!data.items || data.items.length === 0) {
      throw new AppError("At least one item is required", 400);
    }

    const mergedItems = PurchaseOrderService.mergeItems(data.items);

    if (!mergedItems || mergedItems.length === 0) {
      throw new AppError("At least one item is required", 400);
    }

    const poNumber = await PONumberGenerator.generatePONumber(sellerCompanyId);
    const existingPO = await prisma.purchaseOrder.findFirst({
      where: { poNumber, supplierId: supplierRecord.id },
    });

    if (existingPO) {
      throw new AppError("Purchase order number already exists", 409);
    }

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        companyId:
          data.companyId && data.companyId !== "" ? data.companyId : null,
        // use the Suppliers.id (not Company id) for supplierId
        supplierId: supplierRecord.id,
        notes: data.notes,
        clientAddress: data.clientAddress ?? null,
        reqClientId: clientId,
        expectedDeliveryDate: new Date(data.expectedDeliveryDate),
        items: {
          create: mergedItems.map((item) => {
            const createObj: Prisma.PurchaseOrderItemUncheckedCreateWithoutPurchaseOrderInput =
              {
                itemId: item.itemId,
                quantity: Number(item.quantity),
                ...(item.packSize !== undefined && item.packSize !== null
                  ? { packSize: item.packSize }
                  : {}),
              };

            return createObj;
          }),
        },
      },
      include: {
        suppliers: true,
        items: {
          include: { item: true },
        },
      },
    });

    return {
      message: "Client order created successfully",
      data: purchaseOrder,
    };
  }

  public static async updateClientOrder(
    id: string,
    data: UpdateClientOrderDto,
    req: Request,
  ) {
    const sellerCompanyId = req.user?.company?.companyId;
    if (!sellerCompanyId) {
      throw new AppError("Seller company ID is missing", 400);
    }

    // Resolve the Suppliers record for this seller company
    const supplierRecord = await prisma.suppliers.findFirst({
      where: {
        OR: [
          { supplierCompanyId: sellerCompanyId },
          { companyId: sellerCompanyId },
        ],
      },
    });

    if (!supplierRecord) {
      throw new AppError(
        "Supplier profile for seller company not found. Create a supplier entry with supplierCompanyId set to your company id.",
        400,
      );
    }

    const existingPO = await prisma.purchaseOrder.findFirst({
      where: { id, supplierId: supplierRecord.id },
      include: { stockReceipts: true, items: true },
    });

    if (!existingPO) {
      throw new AppError(
        "Client purchase order not found or you do not have permission",
        404,
      );
    }

    if (existingPO.stockReceipts && existingPO.stockReceipts.length > 0) {
      throw new AppError(
        "Cannot modify purchase order with existing stock receipts",
        400,
      );
    }

    const poUpdate: Prisma.PurchaseOrderUncheckedUpdateInput = {};

    if (data.poNumber) poUpdate.poNumber = data.poNumber;
    if (data.notes !== undefined)
      poUpdate.notes = data.notes as string | undefined;
    if (data.expectedDeliveryDate)
      poUpdate.expectedDeliveryDate = new Date(
        data.expectedDeliveryDate as string,
      );
    if (data.clientAddress !== undefined)
      poUpdate.clientAddress = data.clientAddress as string | undefined;

    // companyId is optional in schema (unchecked input allows setting it directly)
    poUpdate.companyId =
      data.companyId && data.companyId !== "" ? data.companyId : null;

    if (data.clientId) poUpdate.reqClientId = data.clientId;

    if (data.items && data.items.length > 0) {
      const mergedItems = PurchaseOrderService.mergeItems(
        data.items as PurchaseOrderItemDto[],
      );

      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      const nestedCreate: Prisma.PurchaseOrderItemUncheckedCreateWithoutPurchaseOrderInput[] =
        mergedItems.map((item) => ({
          itemId: item.itemId,
          quantity: Number(item.quantity),
          ...(item.packSize !== undefined && item.packSize !== null
            ? { packSize: item.packSize }
            : {}),
        }));

      poUpdate.items = {
        create: nestedCreate,
      } as Prisma.PurchaseOrderItemUncheckedCreateNestedManyWithoutPurchaseOrderInput;
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: poUpdate,
      include: {
        suppliers: true,
        items: { include: { item: true } },
      },
    });

    return {
      message: "Client order updated successfully",
      data: updated,
    };
  }

  public static async deleteClientOrder(id: string, req: Request) {
    const sellerCompanyId = req.user?.company?.companyId;
    if (!sellerCompanyId) {
      throw new AppError("Seller company ID is missing", 400);
    }

    // Resolve the Suppliers record for this seller company
    const supplierRecord = await prisma.suppliers.findFirst({
      where: {
        OR: [
          { supplierCompanyId: sellerCompanyId },
          { companyId: sellerCompanyId },
        ],
      },
    });

    if (!supplierRecord) {
      throw new AppError(
        "Supplier profile for seller company not found. Create a supplier entry with supplierCompanyId set to your company id.",
        400,
      );
    }

    const existingPO = await prisma.purchaseOrder.findFirst({
      where: { id, supplierId: supplierRecord.id },
    });
    if (!existingPO) {
      throw new AppError(
        "Client purchase order not found or you do not have permission",
        404,
      );
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
    return { message: "Client purchase order deleted successfully" };
  }
}
