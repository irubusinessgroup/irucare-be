/** Shared custom partnership pricing (RWF). Keep in sync with FE partnershipPricing.ts */

export const PARTNERSHIP_BASE_MONTHLY = 20_000;
export const PARTNERSHIP_SETUP_FEE = 100_000;

export type PartnershipBilling = "monthly" | "yearly" | "month" | "year";

export function normalizeBillingCycle(billing: string): "month" | "year" {
  const b = (billing || "").toLowerCase();
  if (b === "yearly" || b === "year") return "year";
  return "month";
}

export function partnershipUserPrice(count: number) {
  const extra = count - 1;
  if (extra <= 0) return 0;
  if (count <= 5) return extra * 8_000;
  if (count <= 20) return extra * 7_000;
  if (count <= 60) return extra * 6_000;
  return extra * 5_000;
}

export function partnershipLocationPrice(count: number) {
  const extra = count - 1;
  if (extra <= 0) return 0;
  if (count <= 5) return extra * 30_000;
  if (count <= 20) return extra * 25_000;
  return extra * 20_000;
}

export function calculatePartnershipPricing(
  users: number,
  locations: number,
  billing: PartnershipBilling | string,
  options?: { includeSetupFee?: boolean },
) {
  const safeUsers = Math.max(1, Math.floor(users || 1));
  const safeLocations = Math.max(1, Math.floor(locations || 1));
  const cycle = normalizeBillingCycle(billing);
  const additionalUsersCost = partnershipUserPrice(safeUsers);
  const additionalLocationsCost = partnershipLocationPrice(safeLocations);
  const monthlyTotal =
    PARTNERSHIP_BASE_MONTHLY + additionalUsersCost + additionalLocationsCost;
  const yearlyTotal = monthlyTotal * 10;
  const subscriptionPrice = cycle === "month" ? monthlyTotal : yearlyTotal;
  const includeSetup = options?.includeSetupFee !== false;
  const setupFee = includeSetup ? PARTNERSHIP_SETUP_FEE : 0;

  return {
    users: safeUsers,
    locations: safeLocations,
    billingCycle: cycle,
    periodLabel: cycle === "year" ? "/year" : "/month",
    additionalUsersCost,
    additionalLocationsCost,
    monthlyTotal,
    yearlyTotal,
    subscriptionPrice,
    setupFee,
    totalDueToday: subscriptionPrice + setupFee,
    selectedPlan: `Custom (${safeUsers} user${safeUsers === 1 ? "" : "s"}, ${safeLocations} location${safeLocations === 1 ? "" : "s"})`,
  };
}
