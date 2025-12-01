import {
  Body,
  Controller,
  Get,
  Path,
  Post,
  Put,
  //   Query,
  Request,
  Route,
  Security,
  Tags,
  Delete,
  Middlewares,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { ConsultationService } from "../services/ConsultationService";
import {
  AddDiagnosisDto,
  CreateConsultationDto,
  UpdateConsultationDto,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Consultation")
@Route("api/consultation")
@Security("jwt")
export class ConsultationController extends Controller {
  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateConsultationDto
  ): Promise<any> {
    return ConsultationService.create(req, body);
  }

  @Get("/encounter/{encounterId}")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public getByEncounter(
    @Path() encounterId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.getByEncounterId(encounterId, req);
  }

  @Put("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public update(
    @Path() id: string,
    @Body() body: UpdateConsultationDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.update(id, body, req);
  }

  @Post("/{consultationId}/diagnosis")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public addDiagnosis(
    @Path() consultationId: string,
    @Body() body: AddDiagnosisDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.addDiagnosis(consultationId, body, req);
  }

  @Put("/diagnosis/{id}")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public updateDiagnosis(
    @Path() id: string,
    @Body() body: Partial<AddDiagnosisDto>,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.updateDiagnosis(id, body, req);
  }

  @Delete("/diagnosis/{id}")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR, ClinicRole.CLINIC_ADMIN))
  public removeDiagnosis(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.removeDiagnosis(id, req);
  }

  @Get("/patient/{patientId}/diagnosis-history")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR, ClinicRole.NURSE))
  public diagnosisHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.getPatientDiagnosisHistory(patientId, req);
  }
}
