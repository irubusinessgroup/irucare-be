import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient | import("@prisma/client").PrismaClient;

export type StockSelectStrategy = "FIFO" | "LIFO";

export async function countAvailableStock(
  tx: Tx,
  params: { itemIds: string[] | string; companyId: string },
): Promise<number> {
  const itemIds = Array.isArray(params.itemIds)
    ? params.itemIds
    : [params.itemIds];
  if (itemIds.length === 0) return 0;
  return tx.stock.count({
    where: {
      stockReceipt: { itemId: { in: itemIds }, companyId: params.companyId },
      status: "AVAILABLE",
    },
  });
}

export async function selectAvailableStock(
  tx: Tx,
  params: {
    itemIds: string[] | string;
    companyId: string;
    take: number;
    strategy?: StockSelectStrategy;
  },
) {
  const itemIds = Array.isArray(params.itemIds)
    ? params.itemIds
    : [params.itemIds];
  const strategy = params.strategy || "FIFO";
  if (params.take <= 0 || itemIds.length === 0)
    return [] as Array<{ id: string }>;

  const orderBy =
    strategy === "FIFO"
      ? [
          { stockReceipt: { expiryDate: "asc" as const } },
          { stockReceipt: { dateReceived: "asc" as const } },
        ]
      : [
          { stockReceipt: { expiryDate: "desc" as const } },
          { stockReceipt: { dateReceived: "desc" as const } },
        ];

  const stocks = await tx.stock.findMany({
    where: {
      stockReceipt: { itemId: { in: itemIds }, companyId: params.companyId },
      status: "AVAILABLE",
    },
    select: { id: true },
    orderBy,
    take: params.take,
  });
  return stocks;
}

export async function reserveStockUnits(
  tx: Tx,
  params: {
    stockIds: string[];
    link?: { deliveryItemId?: string; directInvoiceId?: string };
  },
): Promise<number> {
  if (!params.stockIds || params.stockIds.length === 0) return 0;
  const data: Prisma.StockUpdateManyMutationInput = { status: "RESERVED" };
  if (params.link?.deliveryItemId) {
    (data as unknown as { deliveryItemId?: string }).deliveryItemId =
      params.link.deliveryItemId;
  }
  if (params.link?.directInvoiceId) {
    (data as unknown as { directInvoiceId?: string }).directInvoiceId =
      params.link.directInvoiceId;
  }
  const res = await tx.stock.updateMany({
    where: { id: { in: params.stockIds } },
    data,
  });
  return res.count;
}

export async function releaseStockUnits(
  tx: Tx,
  params: { stockIds: string[] },
): Promise<number> {
  if (!params.stockIds || params.stockIds.length === 0) return 0;
  const res = await tx.stock.updateMany({
    where: { id: { in: params.stockIds } },
    data: { status: "AVAILABLE", deliveryItemId: null, directInvoiceId: null },
  });
  return res.count;
}

export async function markStockStatusForDelivery(
  tx: Tx,
  params: {
    deliveryId: string;
    from: "RESERVED";
    to: "IN_TRANSIT" | "AVAILABLE";
  },
): Promise<number> {
  const res = await tx.stock.updateMany({
    where: {
      deliveryItem: { deliveryId: params.deliveryId },
      status: params.from,
    },
    data: { status: params.to },
  });
  return res.count;
}

export async function createBuyerStockFromDeliveryItem(
  tx: Tx,
  params: {
    delivery: {
      id: string;
      buyerCompanyId: string;
      purchaseOrderId: string | null;
      supplierCompanyId: string;
    };
    deliveryItem: {
      id: string;
      purchaseOrderItemId: string | null;
      actualUnitPrice: unknown | null;
      purchaseOrderItem?: {
        unitPrice: unknown | null;
        packSize?: unknown | null;
      } | null;
    };
    buyerItemId: string;
    quantityReceived: number;
    unitCost: number;
    expiryDate: Date | null;
  },
): Promise<{ stockReceiptId: string }> {
  const stockReceipt = await tx.stockReceipts.create({
    data: {
      id: `${params.delivery.id}-${params.buyerItemId}-${params.expiryDate?.toISOString() || "no-expiry"}`,
      itemId: params.buyerItemId,
      purchaseOrderId: params.delivery.purchaseOrderId,
      purchaseOrderItemId: params.deliveryItem.purchaseOrderItemId,
      supplierId: null,
      companyId: params.delivery.buyerCompanyId,
      dateReceived: new Date(),
      quantityReceived: params.quantityReceived,
      unitCost: params.unitCost,
      totalCost: params.unitCost * params.quantityReceived,
      packSize:
        (params.deliveryItem.purchaseOrderItem?.packSize as number | null) ||
        null,
      expiryDate: params.expiryDate,
      uom: "UNITS",
      tempReq: "ROOM_TEMP",
      currency: "RWF",
      condition: "GOOD",
      warehouseId: null,
      receiptType: "DELIVERY",
    },
  });

  await tx.stock.createMany({
    data: Array.from({ length: params.quantityReceived }, () => ({
      stockReceiptId: stockReceipt.id,
      status: "AVAILABLE",
    })),
  });

  return { stockReceiptId: stockReceipt.id };
}

export async function markStockSold(
  tx: Tx,
  params: { stockIds: string[]; sellId: string },
): Promise<number> {
  if (!params.stockIds || params.stockIds.length === 0) return 0;
  const res = await tx.stock.updateMany({
    where: { id: { in: params.stockIds } },
    data: {
      status: "SOLD",
      sellId: params.sellId,
    },
  });
  return res.count;
}
