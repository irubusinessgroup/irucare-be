import { NextFunction, Request, Response } from "express";
import AppError from "../utils/error";
import { roles, ClinicRole } from "../utils/roles";
import { TUser } from "../utils/interfaces/common";

type Role = keyof typeof roles;

export const checkRole =
  (...permissions: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as TUser | undefined;
      if (!user?.userRoles) {
        return next(new AppError("Access denied", 403));
      }

      const isAllowed = user.userRoles.some((permission) =>
        permissions.includes(permission.name as Role),
      );

      if (!isAllowed) {
        return next(new AppError("Access Denied", 403));
      }

      return next();
    } catch (error) {
      return next(new AppError("Access denied", 403));
    }
  };

export const checkClinicRole =
  (...clinicRoles: ClinicRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as TUser | undefined;
      const industry = user?.company?.company?.industry;
      const isClinic = industry === "CLINIC" || industry === "HOSPITAL";

      if (!isClinic) {
        return next(new AppError("Access Denied: Clinic roles only", 403));
      }

      if (!user?.clinicUserRoles) {
        return next(
          new AppError("Access Denied: No clinic roles assigned", 403),
        );
      }

      const isAllowed = user.clinicUserRoles.some((userRole) =>
        clinicRoles.includes(userRole.role),
      );

      if (!isAllowed) {
        return next(new AppError("Access Denied", 403));
      }

      return next();
    } catch (error) {
      return next(new AppError("Access denied", 403));
    }
  };

export const checkRoleAuto =
  (...rolesToCheck: (Role | ClinicRole)[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as TUser | undefined;
      const industry = user?.company?.company?.industry;
      const isClinic = industry === "CLINIC" || industry === "HOSPITAL";

      // Safety Fallback: If no company, treat as Global (Non-clinic)
      if (!user?.company || !isClinic) {
        if (!user?.userRoles) {
          return next(new AppError("Access denied", 403));
        }

        // Validate against global roles ONLY
        const isAllowed = user.userRoles.some((userRole) =>
          rolesToCheck.includes(userRole.name as Role),
        );

        if (!isAllowed) {
          return next(new AppError("Access Denied", 403));
        }
        return next();
      }

      // Clinic Mode: Strict validation against clinic roles
      if (isClinic) {
        // Check for Global Roles first (if any provided)
        const globalRolesToCheck = rolesToCheck.filter(
          (r) => !Object.values(ClinicRole).includes(r as ClinicRole)
        ) as Role[];

        let isGlobalAllowed = false;
        if (globalRolesToCheck.length > 0 && user?.userRoles) {
          isGlobalAllowed = user.userRoles.some((userRole) =>
            globalRolesToCheck.includes(userRole.name as Role)
          );
        }

        if (isGlobalAllowed) {
          return next();
        }

        // If not allowed by global role, check clinic roles
        if (!user?.clinicUserRoles) {
          return next(
            new AppError("Access Denied: No clinic roles assigned", 403)
          );
        }

        // Filter provided roles to only include ClinicRoles
        const clinicRolesToCheck = rolesToCheck.filter((r) =>
          Object.values(ClinicRole).includes(r as ClinicRole)
        ) as ClinicRole[];

        const isClinicAllowed = user.clinicUserRoles.some((userRole) =>
          clinicRolesToCheck.includes(userRole.role)
        );

        if (!isClinicAllowed) {
          return next(new AppError("Access Denied", 403));
        }
        return next();
      }

      return next(new AppError("Access Denied", 403));
    } catch (error) {
      return next(new AppError("Access denied", 403));
    }
  };
