import type { Request, Response, NextFunction } from "express";
import { AuditLogService } from "../services/AuditLogService";

/**
 * Middleware to automatically log clinical data changes
 */
export function auditMiddleware(
  entityType: string,
  getEntityId: (req: Request) => string | undefined,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to capture response
    res.json = function (body: unknown) {
      // Determine action based on HTTP method
      let action: "CREATE" | "UPDATE" | "DELETE" | "VIEW" = "VIEW";
      if (req.method === "POST") action = "CREATE";
      else if (req.method === "PUT" || req.method === "PATCH")
        action = "UPDATE";
      else if (req.method === "DELETE") action = "DELETE";

      const entityId = getEntityId(req);

      if (entityId) {
        // Log the action (don't await to avoid blocking response)
        AuditLogService.logAction(req, {
          entityType,
          entityId,
          action,
          changes: {
            after: body,
          },
        }).catch((error) => {
          console.error("Error in audit middleware:", error);
        });
      }

      // Call original json method
      return originalJson(body);
    };

    next();
  };
}

/**
 * Middleware factory for specific clinical entities
 */
export const auditClinicalData = {
  appointment: auditMiddleware("APPOINTMENT", (req) => {
    return req.params.id || (req.body as { id?: string })?.id;
  }),

  encounter: auditMiddleware("ENCOUNTER", (req) => {
    return req.params.id || (req.body as { id?: string })?.id;
  }),

  prescription: auditMiddleware("PRESCRIPTION", (req) => {
    return req.params.id || (req.body as { id?: string })?.id;
  }),

  labOrder: auditMiddleware("LAB_ORDER", (req) => {
    return req.params.id || (req.body as { id?: string })?.id;
  }),

  emr: auditMiddleware("EMR", (req) => {
    return req.params.id || (req.body as { id?: string })?.id;
  }),

  billing: auditMiddleware("BILLING", (req) => {
    return req.params.id || (req.body as { id?: string })?.id;
  }),
};
