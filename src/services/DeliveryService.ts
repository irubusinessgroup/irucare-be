import { prisma } from "../utils/client";
import AppError from "../utils/error";
import type { Request } from "express";
import {
  CreateDeliveryDto,
  UpdateDeliveryDto,
  UpdateDeliveryStatusDto,
  DeliveryTrackingDto,
} from "../utils/interfaces/common";
import { Prisma, DeliveryStatus } from "@prisma/client";
import { Server as SocketIOServer } from "socket.io";
import { markStockStatusForDelivery } from "../utils/stock-ops";
import { enrichWithBranchLabels, requireBranchId } from "../utils/branchScope";

type AuthRequest = Request & {
  user?: {
    id?: string;
    company?: { companyId?: string };
    branchId?: string | null;
  };
};

export class DeliveryService {
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
        companyId: companyId,
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

  public static async autoCreateDeliveryFromApprovedPO(..._args: any[]): Promise<never> {
    throw new AppError("Legacy B2B purchase-order delivery is removed. Use sale-invoice delivery.", 410);
  }

  public static async createDelivery(
    data: CreateDeliveryDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    if (!data.sellId && !data.invoiceNumber) {
      throw new AppError(
        "sellId or invoiceNumber is required to create a delivery",
        400,
      );
    }

    return this.createSaleInvoiceDelivery(
      { ...data, deliveryType: "SALE_INVOICE" },
      req,
    );
  }

  /**
   * Delivery plan linked to a normal sale invoice.
   * Supports partial deliveries: multiple plans per invoice until line remaining qty is 0.
   * Stock was already deducted at sale time — no reservation / stock transfer.
   */
  private static async createSaleInvoiceDelivery(
    data: CreateDeliveryDto,
    req: AuthRequest,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    let sell =
      data.sellId
        ? await prisma.sell.findFirst({
            where: { id: data.sellId, companyId, type: "SALE" },
            include: {
              client: true,
              sellItems: { include: { item: true } },
            },
          })
        : null;

    if (!sell && data.invoiceNumber) {
      const invcNo = Number(String(data.invoiceNumber).trim());
      if (!Number.isFinite(invcNo) || invcNo <= 0) {
        throw new AppError("Invalid invoice number", 400);
      }
      sell = await prisma.sell.findFirst({
        where: { invcNo, companyId, type: "SALE" },
        include: {
          client: true,
          sellItems: { include: { item: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!sell) {
      throw new AppError("Sale invoice not found", 404);
    }

    if (!sell.invcNo) {
      throw new AppError(
        "This sale has no invoice number yet. Complete EBM/tax sync first.",
        400,
      );
    }

    // Sum already planned (non-cancelled) quantities per item for this sale
    const existingDeliveries = await prisma.delivery.findMany({
      where: { sellId: sell.id, status: { not: "CANCELLED" } },
      include: { deliveryItems: true },
    });

    const plannedByItem = new Map<string, number>();
    for (const d of existingDeliveries) {
      for (const di of d.deliveryItems) {
        if (!di.itemId) continue;
        plannedByItem.set(
          di.itemId,
          (plannedByItem.get(di.itemId) || 0) + Number(di.quantityToDeliver),
        );
      }
    }

    const remainingByItem = new Map<string, number>();
    for (const si of sell.sellItems) {
      const sold = Number(si.quantity);
      const planned = plannedByItem.get(si.itemId) || 0;
      remainingByItem.set(si.itemId, Math.max(0, sold - planned));
    }

    type SaleDeliveryLine = {
      itemId: string;
      quantityToDeliver: number;
      actualBatchNo?: string;
      actualExpiryDate?: Date | string;
      actualUnitPrice?: number;
    };

    let itemsSource: SaleDeliveryLine[] =
      data.items && data.items.length > 0
        ? data.items
            .filter((item) => item.itemId && Number(item.quantityToDeliver) > 0)
            .map((item) => ({
              itemId: item.itemId!,
              quantityToDeliver: Number(item.quantityToDeliver),
              actualBatchNo: item.actualBatchNo,
              actualExpiryDate: item.actualExpiryDate,
              actualUnitPrice: item.actualUnitPrice
                ? Number(item.actualUnitPrice)
                : undefined,
            }))
        : sell.sellItems
            .map((si) => ({
              itemId: si.itemId,
              quantityToDeliver: remainingByItem.get(si.itemId) || 0,
              actualUnitPrice: Number(si.sellPrice ?? 0),
            }))
            .filter((line) => line.quantityToDeliver > 0);

    if (itemsSource.length === 0) {
      const anyRemaining = [...remainingByItem.values()].some((q) => q > 0);
      throw new AppError(
        anyRemaining
          ? "No items to deliver — set quantity greater than 0 for at least one line"
          : `All items for invoice #${sell.invcNo} are already covered by delivery plans`,
        400,
      );
    }

    for (const item of itemsSource) {
      const stockItem = await prisma.items.findFirst({
        where: { id: item.itemId, companyId },
      });
      if (!stockItem) {
        throw new AppError(`Item not found: ${item.itemId}`, 404);
      }

      const remaining = remainingByItem.get(item.itemId) ?? 0;
      if (item.quantityToDeliver > remaining + 1e-9) {
        throw new AppError(
          `Cannot deliver ${item.quantityToDeliver} of "${stockItem.itemFullName}". Remaining on invoice: ${remaining}`,
          400,
        );
      }
    }

    const deliveryNumber = await this.generateDeliveryNumber(companyId);
    const branchId =
      sell.branchId ||
      (await requireBranchId(companyId, req.user?.branchId ?? null));

    const client = sell.client;
    const isPartial = existingDeliveries.length > 0;
    const deliveryNotes =
      data.deliveryNotes ||
      `${isPartial ? "Partial delivery" : "Delivery"} for tax invoice #${sell.invcNo}${
        client?.name ? ` — Client: ${client.name}` : ""
      }`;

    const delivery = await prisma.delivery.create({
      data: {
        deliveryNumber,
        sellId: sell.id,
        invoiceNumber: String(sell.invcNo),
        branchId,
        companyId: companyId,
        status: "PENDING",
        plannedDeliveryDate: new Date(data.plannedDeliveryDate),
        deliveryAddress: data.deliveryAddress || client?.address || null,
        contactPerson: data.contactPerson || client?.name || null,
        contactPhone: data.contactPhone || client?.phone || null,
        contactEmail: data.contactEmail || client?.email || null,
        deliveryNotes,
        specialInstructions: data.specialInstructions?.trim() || null,
        deliveryCharges: null,
        createdById: req.user?.id,
        deliveryItems: {
          create: itemsSource.map((item) => {
            const sellLine = sell.sellItems?.find((si) => si.itemId === item.itemId);
            return {
              itemId: item.itemId,
              quantityToDeliver: Number(item.quantityToDeliver),
              actualBatchNo: null,
              actualExpiryDate: null,
              actualUnitPrice: sellLine?.sellPrice
                ? Number(sellLine.sellPrice)
                : item.actualUnitPrice
                  ? Number(item.actualUnitPrice)
                  : null,
              itemStatus: "PENDING" as const,
            };
          }),
        },
      },
      include: {
        deliveryItems: {
          include: {
            item: true,
          },
        },
        sell: { include: { client: true } },
        company: true,
      },
    });

    await prisma.deliveryTracking.create({
      data: {
        deliveryId: delivery.id,
        status: "PENDING",
        description: isPartial
          ? `Partial delivery #${existingDeliveries.length + 1} from sale invoice #${sell.invcNo}`
          : `Delivery planned from sale invoice #${sell.invcNo}`,
        updatedById: req.user?.id,
      },
    });

    return {
      message: isPartial
        ? "Partial delivery plan created from sale invoice"
        : "Delivery plan created from sale invoice",
      data: delivery,
    };
  }

  private static async createPOBasedDelivery(..._args: any[]): Promise<never> {
    throw new AppError("Legacy B2B purchase-order delivery is removed. Use sale-invoice delivery.", 410);
  }

  private static async createDirectStockDelivery(..._args: any[]): Promise<never> {
    throw new AppError("Legacy B2B purchase-order delivery is removed. Use sale-invoice delivery.", 410);
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

    if (delivery.companyId !== companyId) {
      throw new AppError("Only supplier can update delivery", 403);
    }

    if (delivery.status === "DELIVERED") {
      throw new AppError("Cannot update delivered orders", 400);
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        ...(data.plannedDeliveryDate && {
          plannedDeliveryDate: new Date(
            data.plannedDeliveryDate as unknown as string,
          ),
        }),
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
          include: { item: true },
        },
        sell: { include: { client: true } },
      },
    });

    // Update delivery items if provided
    if (data.items && data.items.length > 0) {
      for (const itemData of data.items) {
        if (!itemData.itemId) continue;
        await prisma.deliveryItem.updateMany({
          where: {
            deliveryId: delivery.id,
            itemId: itemData.itemId,
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
    _io?: SocketIOServer,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliveryItems: true },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    if (delivery.companyId !== companyId) {
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
      // Sale-invoice deliveries have no reserved stock (already sold)
      if (!delivery.sellId) {
        await markStockStatusForDelivery(prisma, {
          deliveryId,
          from: "RESERVED",
          to: "IN_TRANSIT",
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

    return {
      message: "Delivery status updated successfully",
      data: updatedDelivery,
    };
  }

  public static async getSupplierDeliveries(req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    const branchId = req.user?.branchId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const { searchq, page = 1, limit = 15, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const q = String(searchq || "");

    const orFilters: Prisma.DeliveryWhereInput[] = [];
    if (q) {
      orFilters.push(
        { deliveryNumber: { contains: q } },
        { invoiceNumber: { contains: q } },
        { contactPerson: { contains: q } },
        { sell: { is: { client: { is: { name: { contains: q } } } } } },
      );
    }

    const where: Prisma.DeliveryWhereInput = {
      companyId: companyId,
      ...(branchId ? { branchId } : {}),
      ...(status ? { status: String(status) as DeliveryStatus } : {}),
      ...(orFilters.length ? { OR: orFilters } : {}),
    };

    const deliveries = await prisma.delivery.findMany({
      where,
      include: {
        sell: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                address: true,
                tin: true,
              },
            },
          },
        },
        deliveryItems: {
          include: {
            item: true,
            stocks: true,
          },
        },
        company: true,
        deliveryTracking: {
          include: { updatedBy: true },
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    });

    const totalItems = await prisma.delivery.count({
      where,
    });

    return {
      message: "Supplier deliveries retrieved",
      data: await enrichWithBranchLabels(deliveries),
      totalItems,
      currentPage: Number(page),
      itemsPerPage: Number(limit),
    };
  }

  public static async getBuyerDeliveries(..._args: any[]): Promise<never> {
    throw new AppError("Legacy B2B purchase-order delivery is removed. Use sale-invoice delivery.", 410);
  }

  public static async getDeliveryById(deliveryId: string, req: AuthRequest) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        sell: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                address: true,
                tin: true,
              },
            },
          },
        },
        deliveryItems: {
          include: {
            item: true,
            stocks: true,
          },
        },
        company: true,
        createdBy: true,
        deliveryTracking: {
          include: { updatedBy: true },
          orderBy: { timestamp: "desc" },
        },
      },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    if (delivery.companyId !== companyId) {
      throw new AppError("No permission to view this delivery", 403);
    }

    return {
      message: "Delivery details retrieved",
      data: {
        ...delivery,
        canUpdateStatus: true,
        canEditDelivery: ["PENDING", "IN_TRANSIT"].includes(delivery.status),
        isSaleInvoiceDelivery: Boolean(delivery.sellId),
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
    if (delivery.companyId !== companyId) {
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
    _io?: SocketIOServer,
  ) {
    const companyId = req.user?.company?.companyId;
    if (!companyId) throw new AppError("Company ID is missing", 400);

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { deliveryItems: true },
    });

    if (!delivery) throw new AppError("Delivery not found", 404);

    // Only supplier can cancel, and only if not delivered
    if (delivery.companyId !== companyId) {
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

  public static async confirmDeliveryReceipt(..._args: any[]): Promise<never> {
    throw new AppError("Legacy B2B purchase-order delivery is removed. Use sale-invoice delivery.", 410);
  }
}
