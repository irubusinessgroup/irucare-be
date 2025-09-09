import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import {
  CreateDeliveryDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
  DeliveryTrackingDto,
  ConfirmDeliveryDto,
} from "../utils/interfaces/common";
import { Prisma, DeliveryStatus } from "@prisma/client";

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

export class DeliveryService {
  private static async generateDeliveryNumber(
    companyId: string,
  ): Promise<string> {
    const prefix = "DEL";
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");

    const lastDelivery = await prisma.delivery.findFirst({
      where: {
        supplierCompanyId: companyId,
        deliveryNumber: { startsWith: `${prefix}-${year}${month}` },
      },
      orderBy: { createdAt: "desc" },
    });

    let sequence = 1;
    if (lastDelivery) {
      const lastSequence = parseInt(
        lastDelivery.deliveryNumber.split("-").pop() || "0",
      );
      sequence = lastSequence + 1;
    }

    return `${prefix}-${year}${month}-${sequence.toString().padStart(4, "0")}`;
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

    const existingDelivery = await prisma.delivery.findFirst({
      where: { purchaseOrderId: po.id },
    });

    if (existingDelivery) {
      return {
        message: "Delivery already exists for this PO",
        data: existingDelivery,
      };
    }

    // Check stock availability before creating delivery
    for (const item of po.items) {
      const quantityToDeliver = Number(item.quantityIssued || item.quantity);

      // Check available stock (both from PO and direct additions)
      const availableStock = await prisma.stock.count({
        where: {
          stockReceipt: {
            itemId: item.itemId,
            companyId: po.suppliers.supplierCompanyId!,
            // OR: [
            //   { purchaseOrderId: null },
            //   { purchaseOrderId: purchaseOrderId },
            // ],
          },
          // status: "AVAILABLE",
        },
      });

      if (availableStock < quantityToDeliver) {
        throw new AppError(
          `Insufficient stock for item ${item.item.itemFullName}. Available: ${availableStock}, Required: ${quantityToDeliver}`,
          400,
        );
      }
    }

    const deliveryNumber = await this.generateDeliveryNumber(
      po.suppliers.supplierCompanyId || "",
    );

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
      const availableStock = await prisma.stock.findMany({
        where: {
          stockReceipt: {
            itemId: item.itemId,
            companyId: po.suppliers.supplierCompanyId!,
            OR: [
              { purchaseOrderId: null },
              { purchaseOrderId: purchaseOrderId },
            ],
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

    // Check stock availability before creating delivery
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        const quantityToDeliver = Number(item.quantityToDeliver);

        // Get item ID from purchase order item
        const poItem = await prisma.purchaseOrderItem.findUnique({
          where: { id: item.purchaseOrderItemId },
          include: { item: true },
        });

        if (!poItem) {
          throw new AppError(
            `Purchase order item not found: ${item.purchaseOrderItemId}`,
            404,
          );
        }

        // Check available stock (both from PO and direct additions)
        const availableStock = await prisma.stock.count({
          where: {
            stockReceipt: {
              itemId: poItem.itemId,
              companyId: companyId,
              // OR: [
              //   { purchaseOrderId: null },
              //   { purchaseOrderId: data.purchaseOrderId },
              // ],
            },
            // status: "AVAILABLE",
          },
        });

        if (availableStock < quantityToDeliver) {
          throw new AppError(
            `Insufficient stock for item ${poItem.item.itemFullName}. Available: ${availableStock}, Required: ${quantityToDeliver}`,
            400,
          );
        }
      }
    }

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
          select: { itemId: true },
        });

        if (!poItem) continue;

        // Find available stock units for this item (both from PO and direct additions)
        const availableStock = await prisma.stock.findMany({
          where: {
            stockReceipt: {
              itemId: poItem.itemId,
              companyId: companyId,
              OR: [
                { purchaseOrderId: null }, // Direct additions
                { purchaseOrderId: data.purchaseOrderId }, // From this PO
              ],
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
          // status: "AVAILABLE",
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
    });

    return { message: "Delivery updated successfully", data: updatedDelivery };
  }

  public static async updateDeliveryStatus(
    deliveryId: string,
    data: UpdateDeliveryStatusDto,
    req: AuthRequest,
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

    return {
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
    });

    return {
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
      ...(status ? { status: String(status) as DeliveryStatus } : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
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

    return {
      message: "Delivery cancelled successfully",
      data: updatedDelivery,
    };
  }

  public static async confirmDeliveryReceipt(
    deliveryId: string,
    data: ConfirmDeliveryDto,
    req: AuthRequest,
  ) {
    return prisma.$transaction(async (tx) => {
      const companyId = req.user?.company?.companyId;
      if (!companyId) throw new AppError("Company ID is missing", 400);

      const delivery = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: {
          deliveryItems: {
            include: {
              purchaseOrderItem: true,
              stocks: true, // Include linked stock units
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

        const itemId = deliveryItem.purchaseOrderItem?.itemId;
        if (!itemId) {
          throw new AppError(
            `Item ID missing for purchase order item ${deliveryItem.purchaseOrderItemId}`,
            400,
          );
        }

        // Create stock receipt for received items
        if (quantityReceived > 0) {
          const stockReceipt = await tx.stockReceipts.create({
            data: {
              itemId,
              purchaseOrderId: delivery.purchaseOrderId,
              purchaseOrderItemId: deliveryItem.purchaseOrderItemId,
              supplierId: delivery.purchaseOrder?.supplierId,
              companyId: delivery.buyerCompanyId,
              dateReceived: data.actualDeliveryDate || new Date(),
              quantityReceived,
              unitCost:
                deliveryItem.actualUnitPrice ||
                deliveryItem.purchaseOrderItem?.unitPrice ||
                0,
              totalCost:
                (Number(deliveryItem.actualUnitPrice) ||
                  Number(deliveryItem.purchaseOrderItem?.unitPrice) ||
                  0) * quantityReceived,
              packSize: deliveryItem.purchaseOrderItem?.packSize,
              expiryDate:
                deliveryItem.actualExpiryDate ||
                deliveryItem.purchaseOrderItem?.expiryDate,
              uom: "UNITS",
              tempReq: "ROOM_TEMP",
              currency: "RWF",
              condition: "GOOD",
              storageLocation: "MAIN_WAREHOUSE",
              receiptType: "DELIVERY",
            },
          });

          // Create individual stock units
          const stockUnits = Array.from({ length: quantityReceived }, () => ({
            stockReceiptId: stockReceipt.id,
            status: "AVAILABLE",
          }));

          await tx.stock.createMany({
            data: stockUnits,
          });
        }
      }

      // Update supplier's stock to DELIVERED status (remove from supplier's inventory)
      await tx.stock.updateMany({
        where: {
          deliveryItem: {
            deliveryId: deliveryId,
          },
          status: { in: ["RESERVED", "IN_TRANSIT"] },
        },
        data: {
          status: "DELIVERED",
        },
      });

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
    });
  }
}
