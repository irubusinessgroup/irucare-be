import { prisma } from "./client";
import AppError from "./error";

export async function assertCompanyExists(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new AppError("Company not found", 404);
  }
}

export async function getItemOrThrow(itemId: string, companyId: string) {
  const item = await prisma.items.findUnique({
    where: { id: itemId, companyId },
  });
  if (!item) {
    throw new AppError("Item not found or doesn't belong to your company", 404);
  }
  return item;
}

export async function getSupplierOrThrow(
  supplierId: string,
  companyId: string,
) {
  const supplier = await prisma.suppliers.findUnique({
    where: { id: supplierId, companyId },
  });
  if (!supplier) {
    throw new AppError(
      "Supplier not found or doesn't belong to your company",
      404,
    );
  }
  return supplier;
}

export async function getWarehouseOrThrow(
  warehouseId: string,
  companyId: string,
) {
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId, companyId },
  });
  if (!warehouse) {
    throw new AppError(
      "Warehouse not found or doesn't belong to your company",
      404,
    );
  }
  return warehouse;
}

export async function getPurchaseOrderOrThrow(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) {
    throw new AppError("Purchase order not found", 404);
  }
  return po;
}

export async function getPOByNumberOrThrow(
  poNumber: string,
  companyId?: string,
) {
  const po = await prisma.purchaseOrder.findFirst({
    where: { poNumber, ...(companyId ? { companyId } : {}) },
  });
  if (!po) {
    throw new AppError("Purchase order not found", 404);
  }
  return po;
}

export async function getPOItemOrThrow(id: string, companyId?: string) {
  const poItem = await prisma.purchaseOrderItem.findUnique({
    where: { id },
    include: { purchaseOrder: true },
  });
  if (!poItem) {
    throw new AppError("Purchase order item not found", 404);
  }
  if (companyId && poItem.purchaseOrder.companyId !== companyId) {
    throw new AppError("Invalid purchase order item", 400);
  }
  return poItem;
}
