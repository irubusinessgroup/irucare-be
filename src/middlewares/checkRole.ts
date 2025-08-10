import { NextFunction, Request, Response } from "express";
import AppError from "../utils/error";
import { roles } from "../utils/roles";

type Role = keyof typeof roles;
export const checkRole =
  (...permissions: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("User roles:", req.user?.userRoles);

      if (!req.user?.userRoles) {
        return next(new AppError("Access denied", 403));
      }

      const isAllowed = req.user.userRoles.some((permission) =>
        permissions.includes(permission.name as Role)
      );

      if (!isAllowed) {
        return next(new AppError("Access Denied", 403));
      }

      return next();
    } catch (error) {
      return next(new AppError("Access denied", 403));
    }
  };
