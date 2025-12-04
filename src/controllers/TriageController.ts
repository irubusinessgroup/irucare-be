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
import { checkClinicRole, checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Triage")
@Route("api/triage")
@Security("jwt")
export class TriageController extends Controller {
  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateTriageDto
  ): Promise<any> {
    return TriageService.create(req, body);
  }

  @Get("/encounter/{encounterId}")
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE, ClinicRole.PROVIDER)
  )
  public getByEncounter(
    @Path() encounterId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return TriageService.getByEncounterId(encounterId, req);
  }

  @Put("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE))
  public update(
    @Path() id: string,
    @Body() body: UpdateTriageDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return TriageService.update(id, body, req);
  }

  @Get("/patient/{patientId}/vitals-history")
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE, ClinicRole.PROVIDER)
  )
  public vitalsHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
    @Query() limit?: number
  ): Promise<any> {
    return TriageService.getPatientVitalsHistory(patientId, req, limit);
  }

  @Get("/queue")
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE, ClinicRole.PROVIDER)
  )
  public triageQueue(@Request() req: ExpressRequest): Promise<any> {
    return TriageService.getTriageQueue(req);
  }
}
