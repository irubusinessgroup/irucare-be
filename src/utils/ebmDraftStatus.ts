export type DraftEbmStatus = "APPROVED" | "CANCELED";
export type DraftRowStatus = "PENDING" | "APPROVED" | "SAVED" | "CANCELED";

export function invoiceKey(value: {
  spplrInvcNo?: unknown;
  invcNo?: unknown;
}): string {
  return String(value.spplrInvcNo ?? value.invcNo ?? "");
}

/** Status for a flattened purchase line (one row per itemList entry). */
export function resolvePurchaseFlatRowStatus(
  row: Record<string, unknown>,
): DraftRowStatus {
  if (row._localStatus === "SAVED") return "SAVED";

  const lineStatus = String(
    row._lineStatus ?? row._localEbmStatus ?? row._localStatus ?? "",
  )
    .trim()
    .toUpperCase();

  if (lineStatus === "SAVED") return "SAVED";
  if (lineStatus === "CANCELED" || lineStatus === "CANCELLED") return "CANCELED";
  if (lineStatus === "APPROVED") return "APPROVED";

  const codes = [row.pchsSttsCd, row.prchrAcptcYn].map((value) =>
    String(value ?? "")
      .trim()
      .toUpperCase(),
  );
  if (
    codes.some(
      (code) => code === "04" || code === "CANCELED" || code === "CANCELLED",
    )
  ) {
    return "CANCELED";
  }
  if (codes.some((code) => code === "02" || code === "Y" || code === "APPROVED")) {
    return "APPROVED";
  }

  return "PENDING";
}

/** Status for a single import draft row. */
export function resolveImportRowStatus(
  row: Record<string, unknown>,
): DraftRowStatus {
  const status = String(
    row._lineStatus ?? row._localStatus ?? row._localEbmStatus ?? "",
  )
    .trim()
    .toUpperCase();

  if (status === "SAVED") return "SAVED";
  if (status === "CANCELED" || status === "CANCELLED") return "CANCELED";
  if (status === "APPROVED") return "APPROVED";

  const code = String(row.imptItemSttsCd ?? "").trim();
  if (code === "4") return "CANCELED";
  if (code === "3") return "APPROVED";

  return "PENDING";
}

export function draftRowStatusPriority(status: DraftRowStatus): number {
  switch (status) {
    case "PENDING":
      return 0;
    case "APPROVED":
      return 1;
    case "SAVED":
      return 2;
    case "CANCELED":
      return 3;
  }
}

/** Branch filter: unassigned rows only while PENDING; assigned rows match branch. */
export function matchesEbmDraftBranchScope(
  row: Record<string, unknown>,
  branchId: string | null | undefined,
  resolveStatus: (row: Record<string, unknown>) => DraftRowStatus,
): boolean {
  if (!branchId) return true;
  const assigned = row._branchId as string | undefined;
  if (!assigned) {
    return draftRowStatusPriority(resolveStatus(row)) === 0;
  }
  return assigned === branchId;
}

export function normalizeDraftStatusFilter(
  status?: string,
): DraftRowStatus | undefined {
  const normalized = String(status ?? "")
    .trim()
    .toUpperCase();
  if (
    normalized === "PENDING" ||
    normalized === "APPROVED" ||
    normalized === "SAVED" ||
    normalized === "CANCELED"
  ) {
    return normalized;
  }
  return undefined;
}

/** Normalize purchase draft EBM status from local or RRA payload fields. */
export function derivePurchaseEbmStatus(
  payload: Record<string, unknown>,
): DraftEbmStatus | undefined {
  const local = String(payload._localEbmStatus ?? "")
    .trim()
    .toUpperCase();
  if (local === "APPROVED" || local === "CANCELED" || local === "CANCELLED") {
    return local === "APPROVED" ? "APPROVED" : "CANCELED";
  }

  const codes = [payload.pchsSttsCd, payload.prchrAcptcYn, payload.status].map(
    (value) =>
      String(value ?? "")
        .trim()
        .toUpperCase(),
  );

  if (
    codes.some(
      (code) => code === "04" || code === "CANCELED" || code === "CANCELLED",
    )
  ) {
    return "CANCELED";
  }
  if (codes.some((code) => code === "02" || code === "Y" || code === "APPROVED")) {
    return "APPROVED";
  }

  return undefined;
}

/** Normalize import draft EBM status from local or RRA payload fields. */
export function deriveImportEbmStatus(
  payload: Record<string, unknown>,
): DraftEbmStatus | undefined {
  const local = String(payload._localEbmStatus ?? "")
    .trim()
    .toUpperCase();
  if (local === "APPROVED" || local === "CANCELED" || local === "CANCELLED") {
    return local === "APPROVED" ? "APPROVED" : "CANCELED";
  }

  const code = String(payload.imptItemSttsCd ?? "").trim();
  if (code === "4") return "CANCELED";
  if (code === "3") return "APPROVED";

  return undefined;
}
