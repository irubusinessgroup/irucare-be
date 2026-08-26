import { Request, Response, NextFunction } from "express";

export type PaypackRawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Capture exact raw bytes for HMAC verification (Oazis pattern).
 * Must run only on the Paypack webhook path, with JSON body parser skipped.
 */
export function paypackWebhookRawBody(
  req: PaypackRawBodyRequest,
  _res: Response,
  next: NextFunction,
) {
  if (req.method === "HEAD" || req.method === "GET") {
    return next();
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    req.rawBody = Buffer.concat(chunks);
    next();
  });
  req.on("error", next);
}

export function isPaypackWebhookPath(req: Request): boolean {
  const path = (req.path || req.url || "").split("?")[0];
  return (
    path === "/api/payments/paypack/webhook" ||
    path.endsWith("/payments/paypack/webhook")
  );
}
