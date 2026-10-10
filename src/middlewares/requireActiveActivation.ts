import { NextFunction, Request, Response } from "express";
import AppError from "../utils/error";
import { isPlatformRole } from "../utils/roles";
import { TUser } from "../utils/interfaces/common";
import { ActivationService } from "../services/ActivationService";

/**
 * Blocks company operations until RRA EBM activation (KYC) is ACTIVE.
 * Platform admins without a company context pass.
 */
export const requireActiveActivation = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const user = req.user as TUser | undefined;
    if (!user) return next(new AppError("Unauthorized", 401));

    const roleNames = (user.userRoles || []).map((r) => r.name as string);
    const companyId = user.company?.companyId;
    if (!companyId) {
      return isPlatformRole(roleNames)
        ? next()
        : next(new AppError("Company context required", 403));
    }

    const { allowed } = await ActivationService.getAccessStatus(companyId);
    if (allowed) return next();
    return next(
      new AppError(
        "Your RRA EBM activation is still in progress. Invoicing unlocks once your device is activated.",
        423,
      ),
    );
  } catch (error) {
    return next(error);
  }
};
