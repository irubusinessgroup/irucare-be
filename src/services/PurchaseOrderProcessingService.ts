import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { ItemApprovalStatus } from "@prisma/client";
import type { Request } from "express";
import {
  CreateProcessingEntryDto,
  ApproveItemsDto,
} from "../utils/interfaces/common";
import { Prisma, ProcessingStatus } from "@prisma/client";

type AuthRequest = Request & {
  user?: { company?: { companyId?: string } };
};

type POPWithPO = Prisma.PurchaseOrderProcessingGetPayload<{
  include: {
    purchaseOrder: {
      include: {
        items: { include: { item: true } };
        suppliers: true;
        company: true;
        user: true;
      };
    };
  };
}>;

export class OrderProcessingService {
  public static async createUpdateProcessingDraft(
    data: CreateProcessingEntryDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId },
      include: { suppliers: true },
    });
    if (!po) throw new AppError("Purchase order not found", 404);

    // Prevent creating/updating processing draft if PO has already progressed
    if (po.overallStatus !== "NOT_YET") {
      throw new AppError(
        "Cannot edit this performa because the purchase order has progressed — the client may have already taken decisions",
        400,
      );
    }

    // Determine companyFrom and companyTo
    const companyFromId = companyId;
    const companyToId = po.companyId;

    // If the purchase order buyer is not a company (companyId is null), we cannot
    // create a processing entry between companies. Reject early with a clear error.
    if (!companyToId) {
      throw new AppError(
        "Cannot create processing entry: purchase order buyer is not a company",
        400,
      );
    }

    const itemUpdates: Promise<unknown>[] = [];

    for (const itemEntry of data.items) {
      // Select only fields we need to avoid incorrect inferred types
      const poItem = await prisma.purchaseOrderItem.findUnique({
        where: { id: itemEntry.purchaseOrderItemId },
        select: {
          id: true,
          purchaseOrderId: true,
          quantity: true,
          quantityIssued: true,
        },
      });

      if (!poItem || poItem.purchaseOrderId !== po.id)
        throw new AppError(
          `Purchase order item ${itemEntry.purchaseOrderItemId} not found for this PO`,
          404,
        );

      const newIssued = itemEntry.quantityIssued
        ? Number(itemEntry.quantityIssued)
        : 0;

      // Note: Do not block when newIssued would make total exceed orderedQty.
      // We treat quantityIssued from the request as the value to set/overwrite
      // (the frontend sends the amount being issued in this processing operation).

      const updateData: Record<string, unknown> = {};
      if (itemEntry.batchNo !== undefined)
        updateData.batchNo = itemEntry.batchNo;
      if (itemEntry.expiryDate !== undefined)
        updateData.expiryDate = itemEntry.expiryDate;
      if (itemEntry.unitPrice !== undefined)
        updateData.unitPrice = itemEntry.unitPrice;
      if (itemEntry.quantityIssued !== undefined)
        updateData.quantityIssued = Number(newIssued);

      // Compute totalPrice when unitPrice and quantityIssued are provided (use overwrite semantics)
      if (
        itemEntry.unitPrice !== undefined &&
        itemEntry.quantityIssued !== undefined
      ) {
        const unit = Number(itemEntry.unitPrice);
        updateData.totalPrice = Number((unit * Number(newIssued)).toFixed(2));
      }

      if (Object.keys(updateData).length > 0) {
        itemUpdates.push(
          prisma.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: updateData,
          }),
        );
      }
    }

    // Run item updates first
    await Promise.all(itemUpdates);

    // Update purchase order totals if provided in request
    const draftData = data as CreateProcessingEntryDto & {
      subtotal?: number;
      vat?: number;
      vatRate?: number;
      grandTotal?: number;
    };

    const poUpdateData: Record<string, unknown> = {};
    if (draftData.subtotal !== undefined)
      poUpdateData.subtotal = Number(draftData.subtotal);
    if (draftData.grandTotal !== undefined)
      poUpdateData.grandTotal = Number(draftData.grandTotal);
    if (draftData.vat !== undefined) poUpdateData.vat = Number(draftData.vat);
    if (draftData.vatRate !== undefined)
      poUpdateData.vatRate = Number(draftData.vatRate);

    if (Object.keys(poUpdateData).length > 0) {
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: poUpdateData,
      });
    }

    // Create or update a single processing entry for this PO between the two companies
    const existingProcessing = await prisma.purchaseOrderProcessing.findFirst({
      where: {
        purchaseOrderId: po.id,
        companyFromId,
        companyToId,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingProcessing) {
      // If an entry exists, update its status to PENDING to reflect a new draft/update
      await prisma.purchaseOrderProcessing.update({
        where: { id: existingProcessing.id },
        data: { status: "PENDING" },
      });
    } else {
      await prisma.purchaseOrderProcessing.create({
        data: {
          purchaseOrderId: po.id,
          companyFromId,
          companyToId,
          status: "PENDING",
        },
      });
    }

    return { message: "Processing draft created/updated successfully" };
  }

  public static async deleteProcessingEntry(id: string, req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const entry = await prisma.purchaseOrderProcessing.findUnique({
      where: { id },
    });
    if (!entry) throw new AppError("Entry not found", 404);

    if (entry.companyFromId !== companyId)
      throw new AppError("Only supplier can delete entry", 403);

    if (entry.status !== "PENDING")
      throw new AppError("Can only delete pending entries", 400);

    await prisma.purchaseOrderProcessing.delete({ where: { id } });
    return { message: "Processing entry deleted" };
  }

  public static async completeAndSend(id: string, req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const entry = await prisma.purchaseOrderProcessing.findUnique({
      where: { id },
    });
    if (!entry) throw new AppError("Entry not found", 404);

    if (entry.companyFromId !== companyId)
      throw new AppError("Only supplier company can complete entry", 403);

    if (entry.status !== "PENDING")
      throw new AppError("This performa copy already sent", 400);

    const updated = await prisma.purchaseOrderProcessing.update({
      where: { id },
      data: { status: "SENT" },
    });

    return { message: "Processing entry completed and sent", data: updated };
  }

  public static async approveItems(
    poNumber: string,
    data: ApproveItemsDto,
    req: AuthRequest,
  ) {
    return prisma.$transaction(async (tx) => {
      const companyId = req.user?.company?.companyId;
      if (!companyId) throw new AppError("Company ID is missing", 400);

      const po = await tx.purchaseOrder.findFirst({
        where: { poNumber, companyId },
      });
      if (!po) throw new AppError("Purchase order not found", 404);

      // Process items one by one sequentially
      for (const itemData of data.items) {
        // fetch the PO item and ensure it belongs to this PO
        const poItem = await tx.purchaseOrderItem.findUnique({
          where: { id: itemData.itemId },
        });
        if (!poItem || poItem.purchaseOrderId !== po.id) {
          throw new AppError(`Item ${itemData.itemId} not found in PO`, 404);
        }

        // Update the purchase order item status (uses ItemApprovalStatus enum values)
        await tx.purchaseOrderItem.update({
          where: { id: itemData.itemId },
          data: { itemStatus: itemData.action },
        });
      }

      // Re-fetch items to compute overall status
      const updatedPO = await tx.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { items: true },
      });

      if (updatedPO) {
        const approvedItems = updatedPO.items.filter(
          (i) => i.itemStatus === "APPROVED",
        );
        const rejectedItems = updatedPO.items.filter(
          (i) => i.itemStatus === "REJECTED",
        );
        const totalItems = updatedPO.items.length;

        let overallStatus:
          | "NOT_YET"
          | "SOME_APPROVED"
          | "ALL_APPROVED"
          | "REJECTED";

        if (rejectedItems.length === totalItems) {
          overallStatus = "REJECTED";
        } else if (approvedItems.length === totalItems) {
          overallStatus = "ALL_APPROVED";
        } else if (approvedItems.length > 0) {
          overallStatus = "SOME_APPROVED";
        } else {
          overallStatus = "NOT_YET";
        }

        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { overallStatus },
        });
      }

      return { message: "Items approval updated successfully" };
    });
  }

  public static async getClientPerforma(req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { searchq, page = 1, limit = 15 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const statuses: ProcessingStatus[] = [
      ProcessingStatus.SENT,
      ProcessingStatus.RECEIVED,
      ProcessingStatus.REJECTED,
    ];

    const purchaseOrderSearch = searchq
      ? {
          OR: [
            { purchaseOrder: { poNumber: { contains: String(searchq) } } },
            {
              purchaseOrder: {
                items: {
                  some: {
                    item: { itemFullName: { contains: String(searchq) } },
                  },
                },
              },
            },
            {
              purchaseOrder: {
                items: {
                  some: {
                    item: { itemCodeSku: { contains: String(searchq) } },
                  },
                },
              },
            },
          ],
        }
      : {};

    const entries = (await prisma.purchaseOrderProcessing.findMany({
      where: {
        companyFromId: companyId,
        status: { in: statuses },
        ...purchaseOrderSearch,
      },
      include: {
        purchaseOrder: {
          include: {
            items: { include: { item: true } },
            suppliers: true,
            company: true,
            user: true,
          },
        },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    })) as POPWithPO[];

    const totalItems = await prisma.purchaseOrderProcessing.count({
      where: {
        companyFromId: companyId,
        status: { in: statuses },
        ...purchaseOrderSearch,
      },
    });

    const clientPerforma = entries.map((entry) => {
      const po = entry.purchaseOrder;
      return {
        processingId: entry.id,
        processingStatus: entry.status,
        poNumber: po.poNumber,
        poId: po.id,
        expectedDeliveryDate: po.expectedDeliveryDate,
        orderedAt: po.createdAt,
        overallStatus: po.overallStatus,
        buyerCompany: po.company,
        grandTotal: po.grandTotal,
        subtotal: po.subtotal,
        isDelivered: po.isDelivered,
        deliveredAt: po.deliveredAt,
        vat: po.vat,
        vatRate: po.vatRate,
        user: po.user,
        supplier: po.suppliers,
        items: po.items.map((item) => ({
          ...item,
          remainingQuantity: null,
        })),
      };
    });

    return {
      message: "Client performa retrieved",
      data: clientPerforma,
      totalItems,
      currentPage: Number(page),
      itemsPerPage: Number(limit),
    };
  }

  public static async getSupplierPerforma(req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { searchq, page = 1, limit = 15 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const statuses: ProcessingStatus[] = [
      ProcessingStatus.SENT,
      ProcessingStatus.RECEIVED,
      ProcessingStatus.REJECTED,
    ];

    const purchaseOrderSearch = searchq
      ? {
          OR: [
            { purchaseOrder: { poNumber: { contains: String(searchq) } } },
            {
              purchaseOrder: {
                items: {
                  some: {
                    item: { itemFullName: { contains: String(searchq) } },
                  },
                },
              },
            },
            {
              purchaseOrder: {
                items: {
                  some: {
                    item: { itemCodeSku: { contains: String(searchq) } },
                  },
                },
              },
            },
          ],
        }
      : {};

    const entries = (await prisma.purchaseOrderProcessing.findMany({
      where: {
        companyToId: companyId,
        status: { in: statuses },
        ...purchaseOrderSearch,
      },
      include: {
        purchaseOrder: {
          include: {
            items: { include: { item: true } },
            suppliers: true,
            company: true,
            user: true,
          },
        },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    })) as POPWithPO[];

    const totalItems = await prisma.purchaseOrderProcessing.count({
      where: {
        companyToId: companyId,
        status: { in: statuses },
        ...purchaseOrderSearch,
      },
    });

    const supplierPerforma = entries.map((entry) => {
      const po = entry.purchaseOrder;
      return {
        processingId: entry.id,
        processingStatus: entry.status,
        poNumber: po.poNumber,
        poId: po.id,
        grandTotal: po.grandTotal,
        subtotal: po.subtotal,
        isDelivered: po.isDelivered,
        deliveredAt: po.deliveredAt,
        vat: po.vat,
        vatRate: po.vatRate,
        expectedDeliveryDate: po.expectedDeliveryDate,
        orderedAt: po.createdAt,
        overallStatus: po.overallStatus,
        buyerCompany: po.company,
        user: po.user,
        supplier: po.suppliers,
        items: po.items.map((item) => ({
          ...item,
          remainingQuantity: null,
        })),
      };
    });

    return {
      message: "Supplier performa retrieved",
      data: supplierPerforma,
      totalItems,
      currentPage: Number(page),
      itemsPerPage: Number(limit),
    };
  }

  public static async getOrdersByPONumber(poNumber: string, req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const po = await prisma.purchaseOrder.findFirst({
      where: {
        poNumber,
      },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        suppliers: true,
        company: true,
        processingEntries: true,
        user: true,
      },
    });

    if (!po) throw new AppError("Purchase order not found", 404);

    const userRole = po.companyId === companyId ? "BUYER" : "SUPPLIER";

    return {
      message: "Purchase order details retrieved",
      data: {
        ...po,
        userRole,
        canApproveItems: userRole === "BUYER",
      },
    };
  }

  // Add this method to the OrderProcessingService class
  public static async getProcessedItems(req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    // Get processed items that are approved and have quantity issued
    const processedItems = await prisma.purchaseOrderItem.findMany({
      where: {
        itemStatus: ItemApprovalStatus.APPROVED,
        quantityIssued: { gt: 0 },
        purchaseOrder: {
          supplierId: companyId, // Current user's company is the supplier
          overallStatus: { in: ["SOME_APPROVED", "ALL_APPROVED"] },
        },
      },
      include: {
        item: true,
        purchaseOrder: {
          select: {
            poNumber: true,
            company: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Calculate remaining quantity for each item (considering previous deliveries)
    const itemsWithRemaining = await Promise.all(
      processedItems.map(async (item) => {
        // Sum up all delivered quantities for this item
        const deliveredResult = await prisma.deliveryItem.aggregate({
          where: {
            purchaseOrderItemId: item.id,
          },
          _sum: {
            quantityDelivered: true,
          },
        });

        const deliveredQuantity = deliveredResult._sum.quantityDelivered || 0;
        const remainingQuantity =
          Number(item.quantityIssued) - Number(deliveredQuantity);

        return {
          ...item,
          remainingQuantity,
          canDeliver: remainingQuantity > 0,
        };
      }),
    );

    // Filter out items that have been fully delivered
    const availableItems = itemsWithRemaining.filter((item) => item.canDeliver);

    return {
      message: "Processed items retrieved successfully",
      data: availableItems,
    };
  }
}
