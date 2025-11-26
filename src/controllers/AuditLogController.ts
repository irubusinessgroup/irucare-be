import { Controller, Get, Request, Route, Security, Tags, Path } from "tsoa";
import type { Request as ExpressRequest } from "express";
import { AuditLogService } from "../services/AuditLogService";

@Tags("Audit Logs")
@Route("api/audit-logs")
@Security("jwt")
export class AuditLogController extends Controller {
  @Get("/")
  public getLogs(@Request() req: ExpressRequest): Promise<any> {
    const {
      page,
      limit,
      entityType,
      entityId,
      userId,
      action,
      startDate,
      endDate,
    } = req.query;
    return AuditLogService.getLogs(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        entityType: entityType as string | undefined,
        entityId: entityId as string | undefined,
        userId: userId as string | undefined,
        action: action as string | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      },
    );
  }

  @Get("/patient/{patientId}")
  public getPatientLogs(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    const { page, limit } = req.query;
    return AuditLogService.getPatientLogs(
      patientId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }
}
