import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import AppError from "../utils/error";
import type { Request } from "express";
import {
  CreateDeliveryDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
  DeliveryTrackingDto,
  ConfirmDeliveryDto,
  UpdateDeliveryStatusDto,
  DeliveryTrackingDto,
  ConfirmDeliveryDto,
} from "../utils/interfaces/common";
import { Prisma, DeliveryStatus } from "@prisma/client";
import { NotificationHelper } from "../utils/notificationHelper";
import { Server as SocketIOServer } from "socket.io";

type AuthRequest = Request & {
  user?: {
    id?: string;
    company?: { companyId?: string };
  };
};

type DeliveryWithDetails = Prisma.DeliveryGetPayload<{
  include: {
    purchaseOrder: {
      include: {
        items: { include: { item: true } };
        suppliers: true;
        company: true;
      };
    };
    deliveryItems: {
      include: {
        purchaseOrderItem: { include: { item: true } };
        stocks: true; // Added stocks relation
      };
    };
    supplierCompany: true;
    buyerCompany: true;
    deliveryTracking: {
      include: { updatedBy: true };
      orderBy: { timestamp: "desc" };
    };
  };
}>;

type DeliveryForNotification = {
  id: string;
  deliveryNumber: string;
  status: string;
  supplierCompanyId: string;
  buyerCompanyId: string;
  purchaseOrder?: { poNumber: string } | null;
  supplierCompany?: { name: string } | null;
  buyerCompany?: { name: string } | null;
};

export class DeliveryService {
  // Helper method to send transit notification to buyer
  private static async sendTransitNotification(
    delivery: DeliveryForNotification,
    supplierCompanyId: string,
    io: SocketIOServer,
  ): Promise<void> {
    if (!delivery.buyerCompanyId) {
      return;
    }

    const supplierCompanyName =
      await NotificationHelper.getCompanyName(supplierCompanyId);

    await NotificationHelper.sendToCompany(
      io,
      delivery.buyerCompanyId,
      "Delivery In Transit",
      `Delivery ${delivery.deliveryNumber} from ${supplierCompanyName} is now in transit. Please prepare to receive and review.`,
      "info",
      `/dashboard/deliveries/${delivery.id}`,
      "delivery_transit",
      delivery.id,
      {
        deliveryNumber: delivery.deliveryNumber,
        supplierCompany: supplierCompanyName,
        buyerCompany: delivery.buyerCompany?.name,
        poNumber: delivery.purchaseOrder?.poNumber,
      },
    );
  }

  // Helper method to send delivery acceptance notification to supplier
  private static async sendDeliveryAcceptanceNotification(
    delivery: DeliveryForNotification,
    buyerCompanyId: string,
    io: SocketIOServer,
  ): Promise<void> {
    if (!delivery.supplierCompanyId) {
      return;
    }

    const buyerCompanyName =
      await NotificationHelper.getCompanyName(buyerCompanyId);

    await NotificationHelper.sendToCompany(
      io,
      delivery.supplierCompanyId,
      "Delivery Accepted",
      `Delivery ${delivery.deliveryNumber} has been accepted by ${buyerCompanyName}.`,
      "success",
      `/dashboard/deliveries/${delivery.id}`,
      "delivery_accepted",
      delivery.id,
      {
        deliveryNumber: delivery.deliveryNumber,
        buyerCompany: buyerCompanyName,
        supplierCompany: delivery.supplierCompany?.name,
        poNumber: delivery.purchaseOrder?.poNumber,
        status: delivery.status,
      },
    );
  }

  // Helper method to send delivery rejection notification to supplier
  private static async sendDeliveryRejectionNotification(
    delivery: DeliveryForNotification,
    buyerCompanyId: string,
    reason: string,
    io: SocketIOServer,
  ): Promise<void> {
    if (!delivery.supplierCompanyId) {
      return;
    }

    const buyerCompanyName =
      await NotificationHelper.getCompanyName(buyerCompanyId);

    await NotificationHelper.sendToCompany(
      io,
      delivery.supplierCompanyId,
      "Delivery Rejected",
      `Delivery ${delivery.deliveryNumber} has been rejected by ${buyerCompanyName}. Reason: ${reason}`,
      "error",
      `/dashboard/deliveries/${delivery.id}`,
      "delivery_rejected",
      delivery.id,
      {
        deliveryNumber: delivery.deliveryNumber,
        buyerCompany: buyerCompanyName,
        supplierCompany: delivery.supplierCompany?.name,
        poNumber: delivery.purchaseOrder?.poNumber,
        reason,
      },
    );
  }
  private static async generateDeliveryNumber(
    companyId: string,
  ): Promise<string> {
    const prefix = "DEL";
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");

    const datePrefix = `${prefix}-${year}${month}`;
    const padLength = 4;
    const maxAttempts = 50;

    const randomLetters = (n: number) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      let out = "";
      for (let i = 0; i < n; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
      return out;
    };

    // Get last sequence for this month to start from next
    const lastDelivery = await prisma.delivery.findFirst({
      where: {
        supplierCompanyId: companyId,
        deliveryNumber: { startsWith: datePrefix },
      },
      orderBy: { createdAt: "desc" },
    });

    let sequence = 1;
    if (lastDelivery?.deliveryNumber) {
      const lastPart = lastDelivery.deliveryNumber.split("-").pop() || "";
      const match = lastPart.match(/\d+/);
      if (match) {
        sequence = parseInt(match[0], 10) + 1;
      }
    }

    // Try several candidates (sequence + small random suffix) and ensure none exists
    let attempts = 0;
    while (attempts < maxAttempts) {
      const candidate = `${datePrefix}-${String(sequence).padStart(padLength, "0")}${randomLetters(1)}`;

      // findUnique works because deliveryNumber has a unique constraint
      const existing = await prisma.delivery
        .findUnique({
          where: { deliveryNumber: candidate },
        })
        .catch(() => null);

      if (!existing) return candidate;

      // collision -> bump sequence and retry
      sequence++;
      attempts++;
    }

    // Fallback: use timestamp and random letters to ensure uniqueness
    return `${datePrefix}-${Date.now().toString().slice(-6)}${randomLetters(2)}`;
  }

  public static async autoCreateDeliveryFromApprovedPO(
    purchaseOrderId: string,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        items: {
          where: { itemStatus: "APPROVED" },
          include: { item: true },
        },
        suppliers: true,
        company: true,
      },
    });

    if (!po) throw new AppError("Purchase order not found", 404);
    if (
      po.overallStatus !== "ALL_APPROVED" &&
      po.overallStatus !== "SOME_APPROVED"
    ) {
      throw new AppError("Purchase order must have approved items", 400);
    }

    // Ensure only supplier company can auto-create a delivery for this PO
    if (po.suppliers.supplierCompanyId !== companyId) {
      throw new AppError(
        "Only supplier can auto-create delivery for this PO",
        403,
      );
    }

    const existingDelivery = await prisma.delivery.findFirst({
      where: { purchaseOrderId: po.id },
    });

    if (existingDelivery) {
      return {
        message: "Delivery already exists for this PO",
        data: existingDelivery,
      };
    }

    const deliveryNumber = await this.generateDeliveryNumber(
      po.suppliers.supplierCompanyId || "",
    );

    // Create the delivery first
    const delivery = await prisma.delivery.create({
      data: {
        deliveryNumber,
        purchaseOrderId: po.id,
        supplierCompanyId: po.suppliers.supplierCompanyId!,
        buyerCompanyId: po.companyId!,
        status: "PENDING",
        plannedDeliveryDate: po.expectedDeliveryDate,
        createdById: req.user?.id,
        deliveryItems: {
          create: po.items.map((item) => ({
            purchaseOrderItemId: item.id,
            quantityToDeliver: item.quantityIssued || item.quantity,
            itemStatus: "PENDING",
          })),
        },
      },
      include: {
        deliveryItems: {
          include: { purchaseOrderItem: { include: { item: true } } },
        },
        purchaseOrder: true,
      },
    });

    // Add initial tracking entry
    await prisma.deliveryTracking.create({
      data: {
        deliveryId: delivery.id,
        status: "PENDING",
        description:
          "Delivery planned automatically from approved purchase order",
        updatedById: req.user?.id,
      },
    });

    // Reserve stock for delivery (supplier side)
    for (const item of po.items) {
      const quantityToReserve = Number(item.quantityIssued || item.quantity);

      // Find available stock units for this item
      const supplierCompanyId = po.suppliers.supplierCompanyId!;
      const sku = item.item.itemCodeSku;

      let supplierItemIds: string[] = [];
      if (sku) {
        const supplierItems = await prisma.items.findMany({
          where: { companyId: supplierCompanyId, itemCodeSku: sku },
          select: { id: true },
        });
        supplierItemIds = supplierItems.map((i) => i.id);
      }

      const availableStock = await prisma.stock.findMany({
        where: {
          stockReceipt: {
            itemId:
              supplierItemIds.length > 0
                ? { in: supplierItemIds }
                : item.itemId,
            companyId: supplierCompanyId,
          },
          status: "AVAILABLE",
        },
        take: quantityToReserve,
      });

      if (availableStock.length < quantityToReserve) {
        throw new AppError(
          `Insufficient stock to reserve for delivery of ${item.item.itemFullName}. Available: ${availableStock.length}, Required: ${quantityToReserve}`,
          400,
        );
      }

      // Get the delivery item to link with stock
      const deliveryItem = await prisma.deliveryItem.findFirst({
        where: {
          deliveryId: delivery.id,
          purchaseOrderItemId: item.id,
        },
      });

      if (!deliveryItem) continue;

      // Reserve stock units for delivery and link to delivery item
      for (const stockUnit of availableStock) {
        await prisma.stock.update({
          where: { id: stockUnit.id },
          data: {
            status: "RESERVED",
            deliveryItemId: deliveryItem.id,
          },
        });
      }
    }

    // Post-create check: ensure only one delivery exists for this PO
    const deliveriesForPo = await prisma.delivery.findMany({
      where: { purchaseOrderId: po.id },
      orderBy: { createdAt: "asc" },
    });

    if (deliveriesForPo.length > 1) {
      // Keep the earliest delivery, remove the rest
      const keep = deliveriesForPo[0];
      const toDelete = deliveriesForPo.slice(1).map((d) => d.id);

      await prisma.$transaction(async (tx) => {
        // Release reserved stocks linked to delivery items of the duplicate deliveries
        await tx.stock.updateMany({
          where: {
            deliveryItem: {
              deliveryId: { in: toDelete },
            },
            status: { in: ["RESERVED", "IN_TRANSIT"] },
          },
          data: {
            status: "AVAILABLE",
            deliveryItemId: null,
          },
        });

        // Delete delivery tracking entries for duplicates
        await tx.deliveryTracking.deleteMany({
          where: { deliveryId: { in: toDelete } },
        });

        // Delete delivery items for duplicates
        await tx.deliveryItem.deleteMany({
          where: { deliveryId: { in: toDelete } },
        });

        // Delete the duplicate deliveries
        await tx.delivery.deleteMany({ where: { id: { in: toDelete } } });
      });

      // Return the kept delivery (re-fetch with includes)
      const finalDelivery = await prisma.delivery.findUnique({
        where: { id: keep.id },
        include: {
          deliveryItems: {
            include: {
              purchaseOrderItem: { include: { item: true } },
              stocks: true,
            },
          },
          purchaseOrder: true,
        },
      });

      return {
        message:
          "Delivery created successfully (duplicates detected and removed)",
        data: finalDelivery,
      };
    }

    return { message: "Delivery created successfully", data: delivery };
  }

  public static async createDelivery(
    data: CreateDeliveryDto,
    req: AuthRequest,
  ) {
    console.log("Received data:", data);
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    // Validate required fields based on delivery type
    if (data.purchaseOrderId) {
      // PO-based delivery
      return this.createPOBasedDelivery(data, req);
    } else {
      // Direct stock delivery
      if (!data.buyerCompanyId) {
        throw new AppError(
          "buyerCompanyId is required for non-PO deliveries",
          400,
        );
      }
      if (!data.items || data.items.length === 0) {
        throw new AppError("items are required for non-PO deliveries", 400);
      }
      return this.createDirectStockDelivery(data, req);
    }
  }

  private static async createPOBasedDelivery(
    data: CreateDeliveryDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: data.purchaseOrderId! },
      include: {
        items: { include: { item: true } },
        suppliers: true,
      },
    });

    if (!po) throw new AppError("Purchase order not found", 404);

    if (po.suppliers.supplierCompanyId !== companyId) {
      throw new AppError("Only supplier can create delivery", 403);
    }

    const existingDelivery = await prisma.delivery.findFirst({
      where: { purchaseOrderId: po.id },
    });

    if (existingDelivery) {
      throw new AppError(
        "Delivery already exists for this purchase order",
        400,
      );
    }

    // Stock availability is verified during order processing. Skip pre-check here.

    const deliveryNumber = await this.generateDeliveryNumber(companyId);

    const delivery = await prisma.delivery.create({
      data: {
        deliveryNumber,
        purchaseOrderId: po.id,
        supplierCompanyId: companyId,
        buyerCompanyId: po.companyId!,
        status: "PENDING",
        plannedDeliveryDate: data.plannedDeliveryDate,
        deliveryAddress: data.deliveryAddress,
        contactPerson: data.contactPerson,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        deliveryNotes: data.deliveryNotes,
        specialInstructions: data.specialInstructions,
        deliveryCharges: data.deliveryCharges
          ? Number(data.deliveryCharges)
          : null,
        createdById: req.user?.id,
        deliveryItems: {
          create: data.items
            ? data.items.map((item) => ({
                purchaseOrderItemId: item.purchaseOrderItemId,
                quantityToDeliver: Number(item.quantityToDeliver),
                actualBatchNo: item.actualBatchNo,
                actualExpiryDate: item.actualExpiryDate,
                actualUnitPrice: item.actualUnitPrice
                  ? Number(item.actualUnitPrice)
                  : null,
                itemStatus: "PENDING",
              }))
            : [],
        },
      },
      include: {
        deliveryItems: {
          include: { purchaseOrderItem: { include: { item: true } } },
        },
        purchaseOrder: true,
      },
    });

    await prisma.deliveryTracking.create({
      data: {
        deliveryId: delivery.id,
        status: "PENDING",
        description: "Delivery created manually",
        updatedById: req.user?.id,
      },
    });

    // Reserve stock for delivery (supplier side)
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        const quantityToReserve = Number(item.quantityToDeliver);

        // Get item ID from purchase order item
        const poItem = await prisma.purchaseOrderItem.findUnique({
          where: { id: item.purchaseOrderItemId },
          include: { item: { select: { itemCodeSku: true } } },
        });

        if (!poItem) continue;

        // Find available stock units for this item (both from PO and direct additions)
        let supplierItemIds: string[] = [];
        const sku = poItem.item?.itemCodeSku;
        if (sku) {
          const supplierItems = await prisma.items.findMany({
            where: { companyId: companyId, itemCodeSku: sku },
            select: { id: true },
          });
          supplierItemIds = supplierItems.map((i) => i.id);
        }

        const availableStock = await prisma.stock.findMany({
          where: {
            stockReceipt: {
              itemId:
                supplierItemIds.length > 0
                  ? { in: supplierItemIds }
                  : poItem.itemId,
              companyId: companyId,
            },
            status: "AVAILABLE",
          },
          take: quantityToReserve,
        });

        if (availableStock.length < quantityToReserve) {
          throw new AppError(
            `Insufficient stock for delivery. Available: ${availableStock.length}, Required: ${quantityToReserve}`,
            400,
          );
        }

        // Get the delivery item to link with stock
        const deliveryItem = await prisma.deliveryItem.findFirst({
          where: {
            deliveryId: delivery.id,
            purchaseOrderItemId: item.purchaseOrderItemId,
          },
        });

        if (!deliveryItem) continue;

        // Reserve stock units for delivery and link to delivery item
        for (const stockUnit of availableStock) {
          await prisma.stock.update({
            where: { id: stockUnit.id },
            data: {
              status: "RESERVED",
              deliveryItemId: deliveryItem.id,
            },
          });
        }
      }
    }

    return { message: "Delivery created successfully", data: delivery };
  }

  private static async createDirectStockDelivery(
    data: CreateDeliveryDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    // Validate buyer company exists
    const buyerCompany = await prisma.company.findUnique({
      where: { id: data.buyerCompanyId! },
    });

    if (!buyerCompany) {
      throw new AppError("Buyer company not found", 404);
    }

    // Check stock availability for direct deliveries
    for (const item of data.items!) {
      // For direct stock deliveries, you need to identify items differently
      // You might need to pass itemId instead of purchaseOrderItemId
      const stockItem = await prisma.items.findUnique({
        where: { id: item.itemId }, // Add itemId to your DTO
        include: { stockReceipts: { include: { stocks: true } } },
      });

      if (!stockItem) {
        throw new AppError(`Item not found: ${item.itemId}`, 404);
      }

      const availableStock = await prisma.stock.count({
        where: {
          stockReceipt: {
            itemId: item.itemId,
            companyId: companyId,
          },
          status: "AVAILABLE",
        },
      });

      if (availableStock < item.quantityToDeliver) {
        throw new AppError(
          `Insufficient stock for item ${stockItem.itemFullName}. Available: ${availableStock}, Required: ${item.quantityToDeliver}`,
          400,
        );
      }
    }

    const deliveryNumber = await this.generateDeliveryNumber(companyId);

    const delivery = await prisma.delivery.create({
      data: {
        deliveryNumber,
        purchaseOrderId: null, // No PO for direct deliveries
        supplierCompanyId: companyId,
        buyerCompanyId: data.buyerCompanyId!,
        status: "PENDING",
        plannedDeliveryDate: data.plannedDeliveryDate,
        deliveryAddress: data.deliveryAddress,
        contactPerson: data.contactPerson,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        deliveryNotes: data.deliveryNotes,
        specialInstructions: data.specialInstructions,
        deliveryCharges: data.deliveryCharges
          ? Number(data.deliveryCharges)
          : null,
        createdById: req.user?.id,
        deliveryItems: {
          create: data.items!.map((item) => ({
            purchaseOrderItemId: null, // No PO item for direct deliveries
            itemId: item.itemId, // Add this field to your schema
            quantityToDeliver: Number(item.quantityToDeliver),
            actualBatchNo: item.actualBatchNo,
            actualExpiryDate: item.actualExpiryDate,
            actualUnitPrice: item.actualUnitPrice
              ? Number(item.actualUnitPrice)
              : null,
            itemStatus: "PENDING",
          })),
        },
      },
      include: {
        deliveryItems: true,
        purchaseOrder: true,
      },
    });

    // Create tracking entry
    await prisma.deliveryTracking.create({
      data: {
        deliveryId: delivery.id,
        status: "PENDING",
        description: "Direct stock delivery created",
        updatedById: req.user?.id,
      },
    });

    // Reserve stock for direct deliveries
    for (const item of data.items!) {
      const quantityToReserve = Number(item.quantityToDeliver);

      const availableStock = await prisma.stock.findMany({
        where: {
          stockReceipt: {
            itemId: item.itemId,
            companyId: companyId,
          },
          status: "AVAILABLE",
        },
        take: quantityToReserve,
      });

      if (availableStock.length < quantityToReserve) {
        throw new AppError(
          `Insufficient stock to reserve for delivery. Available: ${availableStock.length}, Required: ${quantityToReserve}`,
          400,
        );
      }

      const deliveryItem = await prisma.deliveryItem.findFirst({
        where: {
          deliveryId: delivery.id,
          itemId: item.itemId, // Use itemId for direct deliveries
        },
      });

      if (!deliveryItem) continue;

      // Reserve stock units
      for (const stockUnit of availableStock) {
        await prisma.stock.update({
          where: { id: stockUnit.id },
          data: {
            status: "RESERVED",
            deliveryItemId: deliveryItem.id,
          },
        });
      }
    }

    return {
      message: "Direct stock delivery created successfully",
      message: "Direct stock delivery created successfully",
      data: delivery,
    };
  }

  public static async updateDelivery(
    deliveryId: string,
    data: UpdateDeliveryDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliveryItems: true },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    if (delivery.supplierCompanyId !== companyId) {
      throw new AppError("Only supplier can update delivery", 403);
    }

    if (delivery.status === "DELIVERED") {
      throw new AppError("Cannot update delivered orders", 400);
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        plannedDeliveryDate: data.plannedDeliveryDate,
        deliveryAddress: data.deliveryAddress,
        contactPerson: data.contactPerson,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        deliveryNotes: data.deliveryNotes,
        specialInstructions: data.specialInstructions,
        deliveryCharges: data.deliveryCharges
          ? Number(data.deliveryCharges)
          : null,
      },
      include: {
        deliveryItems: {
          include: { purchaseOrderItem: { include: { item: true } } },
        },
        purchaseOrder: true,
      },
    });

    // Update delivery items if provided
    if (data.items && data.items.length > 0) {
      for (const itemData of data.items) {
        await prisma.deliveryItem.updateMany({
          where: {
            deliveryId: delivery.id,
            purchaseOrderItemId: itemData.purchaseOrderItemId,
          },
          data: {
            quantityToDeliver: Number(itemData.quantityToDeliver),
            actualBatchNo: itemData.actualBatchNo,
            actualExpiryDate: itemData.actualExpiryDate,
            actualUnitPrice: itemData.actualUnitPrice
              ? Number(itemData.actualUnitPrice)
              : null,
          },
        });
      }
    }

    await prisma.deliveryTracking.create({
      data: {
        deliveryId: delivery.id,
        status: delivery.status,
        description: "Delivery details updated",
        updatedById: req.user?.id,
      },
    deliveryId: string,
    data: UpdateDeliveryDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliveryItems: true },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    if (delivery.supplierCompanyId !== companyId) {
      throw new AppError("Only supplier can update delivery", 403);
    }

    if (delivery.status === "DELIVERED") {
      throw new AppError("Cannot update delivered orders", 400);
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        plannedDeliveryDate: data.plannedDeliveryDate,
        deliveryAddress: data.deliveryAddress,
        contactPerson: data.contactPerson,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        deliveryNotes: data.deliveryNotes,
        specialInstructions: data.specialInstructions,
        deliveryCharges: data.deliveryCharges
          ? Number(data.deliveryCharges)
          : null,
      },
      include: {
        deliveryItems: {
          include: { purchaseOrderItem: { include: { item: true } } },
        },
        purchaseOrder: true,
      },
    });

    // Update delivery items if provided
    if (data.items && data.items.length > 0) {
      for (const itemData of data.items) {
        await prisma.deliveryItem.updateMany({
          where: {
            deliveryId: delivery.id,
            purchaseOrderItemId: itemData.purchaseOrderItemId,
          },
          data: {
            quantityToDeliver: Number(itemData.quantityToDeliver),
            actualBatchNo: itemData.actualBatchNo,
            actualExpiryDate: itemData.actualExpiryDate,
            actualUnitPrice: itemData.actualUnitPrice
              ? Number(itemData.actualUnitPrice)
              : null,
          },
        });
      }
    }

    await prisma.deliveryTracking.create({
      data: {
        deliveryId: delivery.id,
        status: delivery.status,
        description: "Delivery details updated",
        updatedById: req.user?.id,
      },
    });

    return { message: "Delivery updated successfully", data: updatedDelivery };
  }

  public static async updateDeliveryStatus(
    deliveryId: string,
    data: UpdateDeliveryStatusDto,
    req: AuthRequest,
    io?: SocketIOServer,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliveryItems: true, purchaseOrder: true },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    if (
      delivery.supplierCompanyId !== companyId &&
      delivery.buyerCompanyId !== companyId
    ) {
      throw new AppError("No permission to update this delivery", 403);
    }

    const currentStatus = delivery.status;
    const newStatus = data.status;

    const validTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
      PENDING: ["IN_TRANSIT", "CANCELLED"],
      IN_TRANSIT: ["DELIVERED", "PARTIALLY_DELIVERED", "CANCELLED"],
      DELIVERED: [],
      PARTIALLY_DELIVERED: ["DELIVERED", "CANCELLED"],
      CANCELLED: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new AppError(
        `Cannot change status from ${currentStatus} to ${newStatus}`,
        400,
      );
    }

    const updateData: Prisma.DeliveryUpdateInput = {
      status: newStatus,
      ...(data.dispatchDate && { dispatchDate: data.dispatchDate }),
      ...(data.actualDeliveryDate && {
        actualDeliveryDate: data.actualDeliveryDate,
      }),
      ...(data.courierService && { courierService: data.courierService }),
      ...(data.trackingNumber && { trackingNumber: data.trackingNumber }),
      ...(data.vehicleDetails && { vehicleDetails: data.vehicleDetails }),
      ...(data.driverName && { driverName: data.driverName }),
      ...(data.driverPhone && { driverPhone: data.driverPhone }),
    };

    // Auto-set dates based on status
    if (newStatus === "IN_TRANSIT" && !delivery.dispatchDate) {
      updateData.dispatchDate = new Date();

      // Mark reserved stock as in transit (supplier side)
      if (delivery.supplierCompanyId === companyId) {
        await prisma.stock.updateMany({
          where: {
            deliveryItem: {
              deliveryId: deliveryId,
            },
            status: "RESERVED",
          },
          data: {
            status: "IN_TRANSIT",
          },
        });
      }
    }
    if (
      (newStatus === "DELIVERED" || newStatus === "PARTIALLY_DELIVERED") &&
      !delivery.actualDeliveryDate
    ) {
      updateData.actualDeliveryDate = new Date();
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: updateData,
    });

    // Create tracking entry
    await prisma.deliveryTracking.create({
      data: {
        deliveryId,
        status: newStatus,
        location: data.currentLocation,
        description: data.statusNote || `Status updated to ${newStatus}`,
        updatedById: req.user?.id,
      },
    });

    // Update PO delivery status if fully delivered
    if (newStatus === "DELIVERED" && delivery.purchaseOrderId) {
      await prisma.purchaseOrder.update({
        where: { id: delivery.purchaseOrderId },
        data: {
          isDelivered: true,
          deliveredAt: data.actualDeliveryDate || new Date(),
        },
      });
    }

    // Send notification when delivery status changes to IN_TRANSIT
    if (
      io &&
      newStatus === "IN_TRANSIT" &&
      delivery.supplierCompanyId === companyId
    ) {
      try {
        // Get delivery details with company information for notification
        const deliveryWithDetails = await prisma.delivery.findUnique({
          where: { id: deliveryId },
          include: {
            purchaseOrder: { select: { poNumber: true } },
            supplierCompany: { select: { name: true } },
            buyerCompany: { select: { name: true } },
          },
        });

        if (deliveryWithDetails) {
          await this.sendTransitNotification(
            {
              id: deliveryWithDetails.id,
              deliveryNumber: deliveryWithDetails.deliveryNumber,
              status: deliveryWithDetails.status,
              supplierCompanyId: deliveryWithDetails.supplierCompanyId,
              buyerCompanyId: deliveryWithDetails.buyerCompanyId,
              purchaseOrder: deliveryWithDetails.purchaseOrder,
              supplierCompany: deliveryWithDetails.supplierCompany,
              buyerCompany: deliveryWithDetails.buyerCompany,
            },
            companyId,
            io,
          );
        }
      } catch (error) {
        console.error("Error sending transit notification:", error);
        // Don't throw error here - notification failure shouldn't break the main flow
      }
    }

    return {
      message: "Delivery status updated successfully",
      data: updatedDelivery,
      message: "Delivery status updated successfully",
      data: updatedDelivery,
    };
  }

  public static async getSupplierDeliveries(req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { searchq, page = 1, limit = 15, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const q = String(searchq || "");

    const orFilters: Prisma.DeliveryWhereInput[] = [];
    if (q) {
      orFilters.push(
        { deliveryNumber: { contains: q } },
        { purchaseOrder: { is: { poNumber: { contains: q } } } },
        { buyerCompany: { is: { name: { contains: q } } } },
      );
    }

    const where: Prisma.DeliveryWhereInput = {
      supplierCompanyId: companyId,
      ...(status ? { status: String(status) as DeliveryStatus } : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
    };

    const deliveries = (await prisma.delivery.findMany({
      where,
      include: {
        purchaseOrder: {
          include: {
            items: { include: { item: true } },
            company: true,
          },
        },
        deliveryItems: {
          include: {
            purchaseOrderItem: { include: { item: true } },
          },
        },
        buyerCompany: true,
        deliveryTracking: {
          include: { updatedBy: true },
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    })) as DeliveryWithDetails[];

    const totalItems = await prisma.delivery.count({
      where,
  public static async getSupplierDeliveries(req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { searchq, page = 1, limit = 15, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const q = String(searchq || "");

    const orFilters: Prisma.DeliveryWhereInput[] = [];
    if (q) {
      orFilters.push(
        { deliveryNumber: { contains: q } },
        { purchaseOrder: { is: { poNumber: { contains: q } } } },
        { buyerCompany: { is: { name: { contains: q } } } },
      );
    }

    const where: Prisma.DeliveryWhereInput = {
      supplierCompanyId: companyId,
      ...(status ? { status: String(status) as DeliveryStatus } : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
    };

    const deliveries = (await prisma.delivery.findMany({
      where,
      include: {
        purchaseOrder: {
          include: {
            items: { include: { item: true } },
            company: true,
          },
        },
        deliveryItems: {
          include: {
            purchaseOrderItem: { include: { item: true } },
          },
        },
        buyerCompany: true,
        deliveryTracking: {
          include: { updatedBy: true },
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    })) as DeliveryWithDetails[];

    const totalItems = await prisma.delivery.count({
      where,
    });

    return {
      message: "Supplier deliveries retrieved",
      data: deliveries,
      totalItems,
      currentPage: Number(page),
      itemsPerPage: Number(limit),
      message: "Supplier deliveries retrieved",
      data: deliveries,
      totalItems,
      currentPage: Number(page),
      itemsPerPage: Number(limit),
    };
  }

  public static async getBuyerDeliveries(req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { searchq, page = 1, limit = 15, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const q = String(searchq || "");

    const orFilters: Prisma.DeliveryWhereInput[] = [];
    if (q) {
      orFilters.push(
        { deliveryNumber: { contains: q } },
        { purchaseOrder: { is: { poNumber: { contains: q } } } },
        { supplierCompany: { is: { name: { contains: q } } } },
      );
    }

    const where: Prisma.DeliveryWhereInput = {
      buyerCompanyId: companyId,
      ...(orFilters.length ? { OR: orFilters } : {}),
      AND: [
        { status: { not: DeliveryStatus.PENDING } },
        ...(status ? [{ status: String(status) as DeliveryStatus }] : []),
      ],
    };

    const deliveries = (await prisma.delivery.findMany({
      where,
      include: {
        purchaseOrder: {
          include: {
            items: { include: { item: true } },
          },
        },
        deliveryItems: {
          include: {
            purchaseOrderItem: { include: { item: true } },
          },
        },
        supplierCompany: true,
        deliveryTracking: {
          include: { updatedBy: true },
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    })) as DeliveryWithDetails[];

    const totalItems = await prisma.delivery.count({
      where,
    });

    return {
      message: "Buyer deliveries retrieved",
      data: deliveries,
      totalItems,
      currentPage: Number(page),
      itemsPerPage: Number(limit),
    };
  }

  public static async getDeliveryById(deliveryId: string, req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = (await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        purchaseOrder: {
          include: {
            items: { include: { item: true } },
            suppliers: true,
            company: true,
          },
        },
        deliveryItems: {
          include: {
            purchaseOrderItem: { include: { item: true } },
            stocks: true, // Added stocks relation
          },
        },
        supplierCompany: true,
        buyerCompany: true,
        createdBy: true,
        deliveryTracking: {
          include: { updatedBy: true },
          orderBy: { timestamp: "desc" },
        },
      },
    })) as DeliveryWithDetails & {
      createdBy: Prisma.UserGetPayload<Record<string, never>>;
    };

    if (!delivery) throw new AppError("Delivery not found", 404);

    // Verify access
    if (
      delivery.supplierCompanyId !== companyId &&
      delivery.buyerCompanyId !== companyId
    ) {
      throw new AppError("No permission to view this delivery", 403);
    }

    const userRole =
      delivery.supplierCompanyId === companyId ? "SUPPLIER" : "BUYER";

    return {
      message: "Delivery details retrieved",
      data: {
        ...delivery,
        userRole,
        canUpdateStatus: true, // Both roles can update
        canEditDelivery:
          userRole === "SUPPLIER" &&
          ["PENDING", "IN_TRANSIT"].includes(delivery.status),
      },
    };
  }

  public static async addDeliveryTracking(
    deliveryId: string,
    data: DeliveryTrackingDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    // Verify permission
    if (
      delivery.supplierCompanyId !== companyId &&
      delivery.buyerCompanyId !== companyId
    ) {
      throw new AppError("No permission to update this delivery", 403);
    }

    const tracking = await prisma.deliveryTracking.create({
      data: {
        deliveryId,
        status: delivery.status,
        location: data.location,
        description: data.description,
        updatedById: req.user?.id,
      },
      include: { updatedBy: true },
    });

    return { message: "Delivery tracking added", data: tracking };
  }

  public static async cancelDelivery(
    deliveryId: string,
    reason: string,
    req: AuthRequest,
    io?: SocketIOServer,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliveryItems: true },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    // Only supplier can cancel, and only if not delivered
    if (delivery.supplierCompanyId !== companyId) {
      throw new AppError("Only supplier can cancel delivery", 403);
    }

    if (delivery.status === "DELIVERED") {
      throw new AppError("Cannot cancel delivered orders", 400);
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: { status: "CANCELLED" },
    });

    // Release reserved stock back to available status
    await prisma.stock.updateMany({
      where: {
        deliveryItem: {
          deliveryId: deliveryId,
        },
        status: { in: ["RESERVED", "IN_TRANSIT"] },
      },
      data: {
        status: "AVAILABLE",
        deliveryItemId: null, // Remove the link to delivery item
      },
    });

    // Add tracking entry
    await prisma.deliveryTracking.create({
      data: {
        deliveryId,
        status: "CANCELLED",
        description: `Delivery cancelled. Reason: ${reason}`,
        updatedById: req.user?.id,
      },
    });

    // Send notification to supplier after successful cancellation
    if (io && delivery.buyerCompanyId === companyId) {
      try {
        // Get delivery details with company information for notification
        const deliveryWithDetails = await prisma.delivery.findUnique({
          where: { id: deliveryId },
          include: {
            purchaseOrder: { select: { poNumber: true } },
            supplierCompany: { select: { name: true } },
            buyerCompany: { select: { name: true } },
          },
        });

        if (deliveryWithDetails) {
          await this.sendDeliveryRejectionNotification(
            {
              id: deliveryWithDetails.id,
              deliveryNumber: deliveryWithDetails.deliveryNumber,
              status: deliveryWithDetails.status,
              supplierCompanyId: deliveryWithDetails.supplierCompanyId,
              buyerCompanyId: deliveryWithDetails.buyerCompanyId,
              purchaseOrder: deliveryWithDetails.purchaseOrder,
              supplierCompany: deliveryWithDetails.supplierCompany,
              buyerCompany: deliveryWithDetails.buyerCompany,
            },
            companyId,
            reason,
            io,
          );
        }
      } catch (error) {
        console.error("Error sending delivery rejection notification:", error);
        // Don't throw error here - notification failure shouldn't break the main flow
      }
    }

    return {
      message: "Delivery cancelled successfully",
      data: updatedDelivery,
    };
  }

  public static async confirmDeliveryReceipt(
    deliveryId: string,
    data: ConfirmDeliveryDto,
    req: AuthRequest,
    io?: SocketIOServer,
  ) {
    return prisma
      .$transaction(async (tx) => {
        const companyId = req.user?.company?.companyId;
        if (!companyId) throw new AppError("Company ID is missing", 400);

        const delivery = await tx.delivery.findUnique({
          where: { id: deliveryId },
          include: {
            deliveryItems: {
              include: {
                purchaseOrderItem: true,
                stocks: {
                  include: {
                    stockReceipt: true,
                  },
                },
              },
            },
            purchaseOrder: true,
          },
        });

        if (!delivery) throw new AppError("Delivery not found", 404);

        // Only buyer can confirm receipt
        if (delivery.buyerCompanyId !== companyId) {
          throw new AppError("Only buyer can confirm delivery receipt", 403);
        }

        if (!["IN_TRANSIT", "PARTIALLY_DELIVERED"].includes(delivery.status)) {
          throw new AppError(
            "Delivery must be in transit to confirm receipt",
            400,
          );
        }

        // Update delivery items with received quantities
        let allItemsFullyDelivered = true;

        for (const confirmItem of data.items) {
          const deliveryItem = delivery.deliveryItems.find(
            (di) => di.purchaseOrderItemId === confirmItem.purchaseOrderItemId,
          );

          if (!deliveryItem) {
            throw new AppError(
              `Delivery item not found: ${confirmItem.purchaseOrderItemId}`,
              404,
            );
          }

          const quantityReceived = Number(confirmItem.quantityReceived);
          const quantityDamaged = Number(confirmItem.quantityDamaged || 0);
          const quantityRejected = Number(confirmItem.quantityRejected || 0);

          // Check if fully delivered
          if (quantityReceived < deliveryItem.quantityToDeliver.toNumber()) {
            allItemsFullyDelivered = false;
          }

          // Update delivery item
          await tx.deliveryItem.update({
            where: { id: deliveryItem.id },
            data: {
              quantityDelivered: quantityReceived,
              quantityDamaged,
              quantityRejected,
              notes: confirmItem.damageNotes || confirmItem.rejectionReason,
              itemStatus:
                quantityReceived === deliveryItem.quantityToDeliver.toNumber()
                  ? "DELIVERED"
                  : quantityReceived > 0
                    ? "PENDING"
                    : "REJECTED",
            },
          });

          // Resolve buyer-owned itemId
          // - For PO-based deliveries, purchaseOrderItem.itemId should already belong to the buyer
          // - For direct deliveries, deliveryItem.itemId is supplier's item id; map via SKU to buyer's item
          let buyerItemId: string | null = null;
          if (deliveryItem.purchaseOrderItem?.itemId) {
            buyerItemId = deliveryItem.purchaseOrderItem.itemId;
          } else if (deliveryItem.itemId) {
            const supplierItem = await tx.items.findUnique({
              where: { id: deliveryItem.itemId },
              select: { itemCodeSku: true },
            });
            if (!supplierItem?.itemCodeSku) {
              throw new AppError(
                `Cannot resolve SKU for supplier item ${deliveryItem.itemId}`,
                400,
              );
            }
            const buyerItem = await tx.items.findFirst({
              where: {
                companyId: delivery.buyerCompanyId,
                itemCodeSku: supplierItem.itemCodeSku,
              },
              select: { id: true },
            });
            if (!buyerItem) {
              throw new AppError(
                `Buyer item not found for SKU ${supplierItem.itemCodeSku}`,
                404,
              );
            }
            buyerItemId = buyerItem.id;
          }
          if (!buyerItemId) {
            throw new AppError(
              `Unable to resolve buyer item for delivery item ${deliveryItem.id}`,
              400,
            );
          }

          // Process received items (create stock for buyer)
          if (quantityReceived > 0) {
            const resolvedUnitCost = Number(
              deliveryItem.actualUnitPrice ||
                deliveryItem.purchaseOrderItem?.unitPrice ||
                0,
            );
            const resolvedExpiry =
              deliveryItem.actualExpiryDate ||
              deliveryItem.purchaseOrderItem?.expiryDate ||
              null;

            // Create or update stock receipt for buyer
            const stockReceipt = await tx.stockReceipts.upsert({
              where: {
                // Create a unique identifier for this receipt
                id: `${deliveryId}-${buyerItemId}-${resolvedExpiry?.toISOString() || "no-expiry"}`,
              },
              update: {
                quantityReceived: {
                  increment: quantityReceived,
                },
                totalCost: {
                  increment: resolvedUnitCost * quantityReceived,
                },
                dateReceived: data.actualDeliveryDate || new Date(),
              },
              create: {
                id: `${deliveryId}-${buyerItemId}-${resolvedExpiry?.toISOString() || "no-expiry"}`,
                itemId: buyerItemId,
                purchaseOrderId: delivery.purchaseOrderId,
                purchaseOrderItemId: deliveryItem.purchaseOrderItemId,
                supplierId: delivery.purchaseOrder?.supplierId,
                companyId: delivery.buyerCompanyId,
                dateReceived: data.actualDeliveryDate || new Date(),
                quantityReceived,
                unitCost: resolvedUnitCost,
                totalCost: resolvedUnitCost * quantityReceived,
                packSize: deliveryItem.purchaseOrderItem?.packSize,
                expiryDate: resolvedExpiry,
                uom: "UNITS",
                tempReq: "ROOM_TEMP",
                currency: "RWF",
                condition: "GOOD",
                warehouseId: null,
                receiptType: "DELIVERY",
              },
            });

            // Create individual stock units for buyer
            await tx.stock.createMany({
              data: Array.from({ length: quantityReceived }, () => ({
                stockReceiptId: stockReceipt.id,
                status: "AVAILABLE",
              })),
            });
          }

          // Process damaged/rejected items (return to supplier or mark as damaged)
          if (quantityDamaged > 0 || quantityRejected > 0) {
            const totalProblematic = quantityDamaged + quantityRejected;

            const supplierStocksForProblematic = await tx.stock.findMany({
              where: {
                deliveryItemId: deliveryItem.id,
                status: { in: ["RESERVED", "IN_TRANSIT"] },
              },
              take: totalProblematic,
              select: { id: true },
            });

            // First mark damaged units
            const damagedIds = supplierStocksForProblematic
              .slice(0, quantityDamaged)
              .map((s) => s.id);
            if (damagedIds.length > 0) {
              await tx.stock.updateMany({
                where: { id: { in: damagedIds } },
                data: { status: "DAMAGED" },
              });
            }

            // Then mark rejected units back to available and unlink
            const rejectedIds = supplierStocksForProblematic
              .slice(quantityDamaged, quantityDamaged + quantityRejected)
              .map((s) => s.id);
            if (rejectedIds.length > 0) {
              await tx.stock.updateMany({
                where: { id: { in: rejectedIds } },
                data: { status: "AVAILABLE", deliveryItemId: null },
              });
            }
          }

          // Mark exactly the received quantity as DELIVERED and release any surplus
          {
            const supplierRemaining = await tx.stock.findMany({
              where: {
                deliveryItemId: deliveryItem.id,
                status: { in: ["RESERVED", "IN_TRANSIT"] },
              },
              select: { id: true },
            });

            const toDeliverIds = supplierRemaining
              .slice(0, quantityReceived)
              .map((s) => s.id);
            if (toDeliverIds.length > 0) {
              await tx.stock.updateMany({
                where: { id: { in: toDeliverIds } },
                data: { status: "DELIVERED" },
              });
            }

            const releaseIds = supplierRemaining
              .slice(quantityReceived)
              .map((s) => s.id);
            if (releaseIds.length > 0) {
              await tx.stock.updateMany({
                where: { id: { in: releaseIds } },
                data: { status: "AVAILABLE", deliveryItemId: null },
              });
            }
          }
        }

        // Note: Supplier stock adjustments are handled per-item above to match received quantities.

        // Determine delivery status
        const newStatus = allItemsFullyDelivered
          ? "DELIVERED"
          : "PARTIALLY_DELIVERED";

        // Update delivery
        const updatedDelivery = await tx.delivery.update({
          where: { id: deliveryId },
          data: {
            status: newStatus,
            actualDeliveryDate: data.actualDeliveryDate || new Date(),
          },
        });

        // Update purchase order if fully delivered
        if (newStatus === "DELIVERED" && delivery.purchaseOrderId) {
          await tx.purchaseOrder.update({
            where: { id: delivery.purchaseOrderId },
            data: {
              isDelivered: true,
              deliveredAt: data.actualDeliveryDate || new Date(),
            },
          });
        }

        // Create tracking entry
        await tx.deliveryTracking.create({
          data: {
            deliveryId,
            status: newStatus,
            description: `Delivery ${newStatus.toLowerCase()} and confirmed by ${data.receiverName || "buyer"}. ${data.notes || ""}`,
            updatedById: req.user?.id,
          },
        });

        return {
          message: `Delivery ${newStatus.toLowerCase()} successfully`,
          data: updatedDelivery,
        };
      })
      .then(async (result) => {
        // Send notification to supplier after successful confirmation
        if (io) {
          try {
            // Get delivery details with company information for notification
            const deliveryWithDetails = await prisma.delivery.findUnique({
              where: { id: deliveryId },
              include: {
                purchaseOrder: { select: { poNumber: true } },
                supplierCompany: { select: { name: true } },
                buyerCompany: { select: { name: true } },
              },
            });

            if (deliveryWithDetails) {
              await this.sendDeliveryAcceptanceNotification(
                {
                  id: deliveryWithDetails.id,
                  deliveryNumber: deliveryWithDetails.deliveryNumber,
                  status: deliveryWithDetails.status,
                  supplierCompanyId: deliveryWithDetails.supplierCompanyId,
                  buyerCompanyId: deliveryWithDetails.buyerCompanyId,
                  purchaseOrder: deliveryWithDetails.purchaseOrder,
                  supplierCompany: deliveryWithDetails.supplierCompany,
                  buyerCompany: deliveryWithDetails.buyerCompany,
                },
                req.user?.company?.companyId || "",
                io,
              );
            }
          } catch (error) {
            console.error(
              "Error sending delivery acceptance notification:",
              error,
            );
            // Don't throw error here - notification failure shouldn't break the main flow
          }
        }

        return result;
      });
  }
}
