import type { Request, Response, NextFunction } from "express";
import { ResetService } from "../services/ResetService";
import AppError from "../utils/error";

/**
 * Middleware to validate reset token and password for factory reset
 * Expects password and securityToken in request body
 */
export const validateResetToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // @ts-ignore
    const userId = req.user?.id;
    const { password, securityToken } = req.body;

    if (!userId) {
      return next(new AppError("User not authenticated", 401));
    }

    if (!password || !securityToken) {
      return next(
        new AppError("Password and security token are required", 400),
      );
    }

    // Validate token and password
    await ResetService.validateResetToken(userId, securityToken, password);

    next();
  } catch (error) {
    next(error);
  }
};
