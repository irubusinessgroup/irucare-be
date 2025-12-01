import {
  Body,
  Controller,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { TriageService } from "../services/TriageService";
import { CreateTriageDto, UpdateTriageDto } from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Triage")
@Route("api/triage")
@Security("jwt")
export class TriageController extends Controller {
  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.NURSE))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateTriageDto
  ): Promise<any> {
    return TriageService.create(req, body);
  }

  @Get("/encounter/{encounterId}")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.DOCTOR))
  public getByEncounter(
    @Path() encounterId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return TriageService.getByEncounterId(encounterId, req);
  }

  @Put("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.NURSE))
  public update(
    @Path() id: string,
    @Body() body: UpdateTriageDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return TriageService.update(id, body, req);
  }

  @Get("/patient/{patientId}/vitals-history")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.DOCTOR))
  public vitalsHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
    @Query() limit?: number
  ): Promise<any> {
    return TriageService.getPatientVitalsHistory(patientId, req, limit);
  }

  @Get("/queue")
  @Middlewares(checkClinicRole(ClinicRole.NURSE, ClinicRole.DOCTOR))
  public triageQueue(@Request() req: ExpressRequest): Promise<any> {
    return TriageService.getTriageQueue(req);
  }
}
