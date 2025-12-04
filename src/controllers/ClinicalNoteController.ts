import {
  Body,
  Controller,
  Delete,
  Get,
  Middlewares,
  Path,
  Post,
  Put,
  Query,
  //   Query,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { ClinicalNoteService } from "../services/ClinicalNoteService";
import {
  CreateClinicalNoteDto,
  NoteType,
  UpdateClinicalNoteDto,
} from "../utils/interfaces/common";
import { checkRoleAuto } from "../middlewares";
import { ClinicRole, roles } from "../utils/roles";

@Tags("Clinical Notes")
@Route("api/clinical-notes")
@Security("jwt")
export class ClinicalNoteController extends Controller {
  @Get("/")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.NURSE,
      ClinicRole.PROVIDER,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ) {
    const { patientId, encounterId, noteType, startDate, endDate } = req.query;
    return ClinicalNoteService.list(req, page, limit, {
      patientId: patientId as string,
      encounterId: encounterId as string,
      noteType: noteType as NoteType,
      startDate: startDate as string,
      endDate: endDate as string,
    });
  }

  @Get("/{id}")
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE, ClinicRole.PROVIDER)
  )
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return ClinicalNoteService.getById(id, req);
  }

  @Post("/")
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE, ClinicRole.PROVIDER)
  )
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateClinicalNoteDto
  ): Promise<any> {
    return ClinicalNoteService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(
    checkRoleAuto(
      roles.COMPANY_ADMIN,
      ClinicRole.PROVIDER,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public update(
    @Path() id: string,
    @Body() body: UpdateClinicalNoteDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ClinicalNoteService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.CLINIC_ADMIN))
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ClinicalNoteService.remove(id, req);
  }

  @Get("/encounter/{encounterId}/notes")
  @Middlewares(
    checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.NURSE, ClinicRole.PROVIDER)
  )
  public encounterNotes(
    @Path() encounterId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ClinicalNoteService.getEncounterNotes(encounterId, req);
  }

  @Post("/encounter/{encounterId}/discharge-summary")
  @Middlewares(checkRoleAuto(roles.COMPANY_ADMIN, ClinicRole.PROVIDER))
  public generateDischargeSummary(
    @Path() encounterId: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return ClinicalNoteService.generateDischargeSummary(encounterId, req);
  }
}
