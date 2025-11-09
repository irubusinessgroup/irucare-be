import type { Request } from "express";
import AppError from "./error";

export function getCompanyIdOrThrow(req: Request): string {
  const companyId = req.user?.company?.companyId;
  if (!companyId) {
    throw new AppError("Company ID is missing", 400);
  }
  return companyId;
}

export function getUserIdOrThrow(req: Request): string {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("User ID is missing", 400);
  }
  return userId;
}
