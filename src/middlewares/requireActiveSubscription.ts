import { NextFunction, Request, Response } from "express";
import AppError from "../utils/error";
import { isPlatformRole } from "../utils/roles";
import { TUser } from "../utils/interfaces/common";
import { SubscriptionService } from "../services/SubscriptionService";

/**
 * Blocks company-scoped operations when the company's subscription is missing,
 * inactive, or past endDate. Platform admins (without acting as a company) pass.
 * Always allow subscription subscribe/renew/me and profile/auth-ish paths via skip.
 */
export const requireActiveSubscription = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user as TUser | undefined;
    if (!user) return next(new AppError("Unauthorized", 401));

    const roleNames = (user.userRoles || []).map((r) => r.name as string);
    const companyId = user.company?.companyId;

    // Pure platform (no company context) — always allowed
    if (isPlatformRole(roleNames) && !companyId) {
      return next();
    }

    // Platform acting inside a company — still enforce so ops reflect tenant billing
    // (comment: product chose to enforce for switched company too)
    if (!companyId) {
      return next(new AppError("Company context required", 403));
    }

    const status = await SubscriptionService.getCompanyAccessStatus(companyId);
    if (status.allowed) return next();

    return next(
      new AppError(
        status.reason ||
          "Your subscription is inactive or expired. Renew in Settings to continue.",
        402,
      ),
    );
  } catch (error) {
    return next(error);
  }
};
