import { NextFunction, Request, Response } from "express";
import AppError from "../utils/error";
import { roles } from "../utils/roles";

type Role = keyof typeof roles;
export const checkRole =
  (...persmissions: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    console.log(req.user?.userRoles);
    if (!req.user?.userRoles) {
      throw new AppError("Access denied", 403);
    }
    const isArrowed = req.user?.userRoles.some((permission) =>
      persmissions.includes(permission.name as Role),
    );
    if (!isArrowed) {
      throw new AppError("Access Denied", 403);
    }
    return next();
  };
