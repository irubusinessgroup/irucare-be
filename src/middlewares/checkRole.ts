import { NextFunction, Request, Response } from "express";
import AppError from "../utils/error";
import { roles, ClinicRole, isPlatformRole } from "../utils/roles";
import { TUser } from "../utils/interfaces/common";

type Role = keyof typeof roles;

function expandPermissions(permissions: Role[]): Role[] {
  const set = new Set<Role>(permissions);
  // ADMIN and DEVELOPER share the same platform access
  if (set.has("ADMIN") || set.has("DEVELOPER")) {
    set.add("ADMIN");
    set.add("DEVELOPER");
  }
  return [...set];
}

function userRoleNames(user: TUser): string[] {
  return (user.userRoles || []).map((r) => r.name as string);
}

function platformActsAsCompanyAdmin(user: TUser, expanded: Role[]): boolean {
  if (!isPlatformRole(userRoleNames(user))) return false;
  if (!user.company?.companyId) return false;
  return expanded.some(
    (p) =>
      p === "COMPANY_ADMIN" ||
      p === "BRANCH_ADMIN" ||
      p === "STAFF" ||
      p === "CLIENT",
  );
}

export const checkRole =
  (...permissions: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as TUser | undefined;
      if (!user?.userRoles) {
        return next(new AppError("Access denied", 403));
      }

      const expanded = expandPermissions(permissions);
      const names = userRoleNames(user);

      const isAllowed =
        names.some((name) => expanded.includes(name as Role)) ||
        platformActsAsCompanyAdmin(user, expanded);

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
      const isClinic = industry === "CLINIC";

      if (!isClinic) {
        return next(new AppError("Access Denied: Clinic roles only", 403));
      }

      if (user && isPlatformRole(userRoleNames(user)) && user.company?.companyId) {
        return next();
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
      const isClinic = industry === "CLINIC";
      const names = user ? userRoleNames(user) : [];

      if (user && isPlatformRole(names) && user.company?.companyId) {
        return next();
      }

      // Safety Fallback: If no company, treat as Global (Non-clinic)
      if (!user?.company || !isClinic) {
        if (!user?.userRoles) {
          return next(new AppError("Access denied", 403));
        }

        const globalRolesToCheck = expandPermissions(
          rolesToCheck.filter(
            (r) => !Object.values(ClinicRole).includes(r as ClinicRole),
          ) as Role[],
        );

        const isAllowed = names.some((userRole) =>
          globalRolesToCheck.includes(userRole as Role),
        );

        if (!isAllowed) {
          return next(new AppError("Access Denied", 403));
        }
        return next();
      }

      // Clinic Mode
      if (isClinic) {
        const globalRolesToCheck = expandPermissions(
          rolesToCheck.filter(
            (r) => !Object.values(ClinicRole).includes(r as ClinicRole),
          ) as Role[],
        );

        let isGlobalAllowed = false;
        if (globalRolesToCheck.length > 0 && user?.userRoles) {
          isGlobalAllowed = names.some((userRole) =>
            globalRolesToCheck.includes(userRole as Role),
          );
        }

        if (isGlobalAllowed) {
          return next();
        }

        if (!user?.clinicUserRoles) {
          return next(
            new AppError("Access Denied: No clinic roles assigned", 403),
          );
        }

        const clinicRolesToCheck = rolesToCheck.filter((r) =>
          Object.values(ClinicRole).includes(r as ClinicRole),
        ) as ClinicRole[];

        const isClinicAllowed = user.clinicUserRoles.some((userRole) =>
          clinicRolesToCheck.includes(userRole.role),
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
