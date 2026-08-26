import { prisma } from "../utils/client";
import AppError from "../utils/error";
import { SubscriptionService } from "../services/SubscriptionService";

/**
 * usersCount includes COMPANY_ADMIN.
 * Example: usersCount=2 → 1 company admin + 1 additional staff.
 * locationsCount includes Main Branch.
 */
export async function assertCanAddCompanyUser(companyId: string) {
  const { allowed, subscription, reason } =
    await SubscriptionService.getCompanyAccessStatus(companyId);
  if (!allowed || !subscription) {
    throw new AppError(
      reason ||
        "Active subscription required before adding staff. Open Settings → Subscription to renew or upgrade.",
      402,
    );
  }

  const current = await prisma.companyUser.count({ where: { companyId } });
  const limit = subscription.usersCount ?? 1;
  if (current >= limit) {
    throw new AppError(
      `Staff limit reached (${limit} user${limit === 1 ? "" : "s"} including company admin). Open Settings → Subscription to upgrade.`,
      403,
    );
  }
}

export async function assertCanAddBranch(companyId: string) {
  const { allowed, subscription, reason } =
    await SubscriptionService.getCompanyAccessStatus(companyId);
  if (!allowed || !subscription) {
    throw new AppError(
      reason ||
        "Active subscription required before adding branches. Open Settings → Subscription to renew or upgrade.",
      402,
    );
  }

  const current = await prisma.branch.count({ where: { companyId } });
  const limit = subscription.locationsCount ?? 1;
  if (current >= limit) {
    throw new AppError(
      `Branch limit reached (${limit} location${limit === 1 ? "" : "s"}). Open Settings → Subscription to upgrade.`,
      403,
    );
  }
}
