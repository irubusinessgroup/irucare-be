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
import { checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Consultation")
@Route("api/consultation")
@Security("jwt")
export class ConsultationController extends Controller {
  @Post("/")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateConsultationDto
  ): Promise<any> {
    return ConsultationService.create(req, body);
  }

  @Get("/encounter/{encounterId}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public getByEncounter(
    @Path() encounterId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.getByEncounterId(encounterId, req);
  }

  @Put("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public update(
    @Path() id: string,
    @Body() body: UpdateConsultationDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.update(id, body, req);
  }

  @Post("/{consultationId}/diagnosis")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public addDiagnosis(
    @Path() consultationId: string,
    @Body() body: AddDiagnosisDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.addDiagnosis(consultationId, body, req);
  }

  @Put("/diagnosis/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public updateDiagnosis(
    @Path() id: string,
    @Body() body: Partial<AddDiagnosisDto>,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.updateDiagnosis(id, body, req);
  }

  @Delete("/diagnosis/{id}")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PROVIDER,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public removeDiagnosis(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.removeDiagnosis(id, req);
  }

  @Get("/patient/{patientId}/diagnosis-history")
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER, ClinicRole.NURSE)
  )
  public diagnosisHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ConsultationService.getPatientDiagnosisHistory(patientId, req);
  }
}
