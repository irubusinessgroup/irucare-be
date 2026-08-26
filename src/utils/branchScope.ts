import { prisma } from "./client";
import AppError from "./error";

/** Prisma where fragment: filter by branch only when a branch is selected. */
export function branchWhere(branchId?: string | null): { branchId?: string } {
  return branchId ? { branchId } : {};
}

/**
 * Resolve branch for writes. Prefer the active filter / membership branch;
 * otherwise fall back to the company's Main (first) branch. Never returns null.
 */
export async function requireBranchId(
  companyId: string | null | undefined,
  preferredBranchId?: string | null,
): Promise<string> {
  if (preferredBranchId) {
    if (!companyId) return preferredBranchId;
    const owned = await prisma.branch.findFirst({
      where: { id: preferredBranchId, companyId },
      select: { id: true },
    });
    if (owned) return owned.id;
  }

  if (!companyId) {
    throw new AppError("Company context is required to resolve a branch", 400);
  }

  const main = await prisma.branch.findFirst({
    where: { companyId },
    orderBy: [{ bhfId: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (!main) {
    throw new AppError(
      "This company has no branch. Create at least one branch before continuing.",
      400,
    );
  }

  return main.id;
}

export async function ensureMainBranchForCompany(
  companyId: string,
  locationHint?: string | null,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.branch.findFirst({
    where: { companyId },
    orderBy: [{ bhfId: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.branch.create({
    data: {
      name: "Main Branch",
      location: locationHint || "Main Location",
      bhfId: "00",
      companyId,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

export type BranchLabelFields = {
  branchId?: string | null;
  branchName?: string | null;
  branchBhfId?: string | null;
};

/** Attach branch name/bhfId for list UIs (company admin "all branches" view). */
export async function enrichWithBranchLabels<T extends { branchId?: string | null }>(
  rows: T[],
): Promise<(T & BranchLabelFields)[]> {
  const ids = [
    ...new Set(
      rows
        .map((r) => r.branchId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (ids.length === 0) {
    return rows.map((row) => ({
      ...row,
      branchName: null,
      branchBhfId: null,
    }));
  }

  const branches = await prisma.branch.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, bhfId: true },
  });
  const map = new Map(branches.map((b) => [b.id, b]));

  return rows.map((row) => {
    const branch = row.branchId ? map.get(row.branchId) : undefined;
    return {
      ...row,
      branchName: branch?.name ?? null,
      branchBhfId: branch?.bhfId ?? null,
    };
  });
}
