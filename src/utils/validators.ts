import { prisma } from "./client";
import AppError from "./error";

export async function assertCompanyExists(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new AppError("Company not found", 404);
  }
}

export async function getItemOrThrow(
  itemId: string,
  companyId: string,
  branchId?: string | null,
) {
  const item = await prisma.items.findFirst({
    where: { id: itemId, companyId, ...(branchId ? { branchId } : {}) },
  });
  if (!item) {
    throw new AppError("Item not found or doesn't belong to your company", 404);
  }
  return item;
}

export async function getSupplierOrThrow(
  supplierId: string,
  companyId: string,
  branchId?: string | null,
) {
  const supplier = await prisma.suppliers.findFirst({
    where: { id: supplierId, companyId, ...(branchId ? { branchId } : {}) },
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
  branchId?: string | null,
) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, companyId, ...(branchId ? { branchId } : {}) },
  });
  if (!warehouse) {
    throw new AppError(
      "Warehouse not found or doesn't belong to your company",
      404,
    );
  }
  return warehouse;
}
