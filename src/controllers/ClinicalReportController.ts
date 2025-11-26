import { Controller, Get, Request, Route, Security, Tags, Query } from "tsoa";
import type { Request as ExpressRequest } from "express";
import { ClinicalReportService } from "../services/ClinicalReportService";

@Tags("Clinical Reports")
@Route("api/reports/clinic")
@Security("jwt")
export class ClinicalReportController extends Controller {
  @Get("/provider-performance")
  public getProviderPerformance(
    @Request() req: ExpressRequest,
    @Query() providerId?: string,
    @Query() startDate?: string,
    @Query() endDate?: string
  ) {
    return ClinicalReportService.getProviderPerformance(
      req,
      providerId,
      startDate,
      endDate
    );
  }

  @Get("/patient-outcomes")
  public getPatientOutcomes(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() diagnosis?: string
  ) {
    return ClinicalReportService.getPatientOutcomes(
      req,
      startDate,
      endDate,
      diagnosis
    );
  }

  @Get("/revenue")
  public getRevenueReport(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() groupBy?: "service" | "provider" | "month"
  ) {
    return ClinicalReportService.getRevenueReport(
      req,
      startDate,
      endDate,
      groupBy
    );
  }

  @Get("/lab-utilization")
  public getLabUtilization(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string
  ) {
    return ClinicalReportService.getLabUtilization(req, startDate, endDate);
  }

  @Get("/prescription-compliance")
  public getPrescriptionCompliance(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string
  ) {
    return ClinicalReportService.getPrescriptionCompliance(
      req,
      startDate,
      endDate
    );
  }

  @Get("/appointment-statistics")
  public getAppointmentStatistics(
    @Request() req: ExpressRequest,
    @Query() startDate?: string,
    @Query() endDate?: string,
    @Query() providerId?: string
  ) {
    return ClinicalReportService.getAppointmentStatistics(
      req,
      startDate,
      endDate,
      providerId
    );
  }
}
