import jwt from "jsonwebtoken";
import type { Request } from "express";
import AppError from "./error";

/**
 * Short-lived token that only allows paying a company's subscription.
 * Issued after registration and to company admins blocked at login for lack
 * of an active subscription; it never grants dashboard access.
 */
const SCOPE = "subscription_payment";
const EXPIRES_IN = "2h";

export type PaymentTokenPayload = { companyId: string; userId: string };

export function signPaymentToken(payload: PaymentTokenPayload): string {
  return jwt.sign({ ...payload, scope: SCOPE }, process.env.JWT_SECRET!, {
    expiresIn: EXPIRES_IN,
  });
}

export function readPaymentToken(req: Request): PaymentTokenPayload {
  const token = String(req.headers["x-payment-token"] || "").trim();
  if (!token) throw new AppError("Payment session missing. Sign in again to pay.", 401);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as Partial<
      PaymentTokenPayload & { scope: string }
    >;
    if (decoded.scope !== SCOPE || !decoded.companyId || !decoded.userId) {
      throw new Error("wrong scope");
    }
    return { companyId: decoded.companyId, userId: decoded.userId };
  } catch {
    throw new AppError("Payment session expired. Sign in again to pay.", 401);
  }
}
