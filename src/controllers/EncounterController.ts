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
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { EncounterService } from "../services/EncounterService";
import {
  CreateEncounterDto,
  EncounterStatus,
  UpdateEncounterDto,
  VisitType,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Encounters")
@Route("api/encounters")
@Security("jwt")
export class EncounterController extends Controller {
  @Get("/")
  @Middlewares(
    checkClinicRole(
      ClinicRole.DOCTOR,
      ClinicRole.NURSE,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ): Promise<any> {
    const {
      patientId,
      providerId,
      appointmentId,
      status,
      visitType,
      startDate,
      endDate,
    } = req.query;
    return EncounterService.list(req, page, limit, {
      patientId: patientId as string,
      providerId: providerId as string,
      appointmentId: appointmentId as string,
      status: status as EncounterStatus,
      visitType: visitType as VisitType,
      startDate: startDate as string,
      endDate: endDate as string,
    });
  }

  @Get("/{id}")
  @Middlewares(
    checkClinicRole(
      ClinicRole.DOCTOR,
      ClinicRole.NURSE,
      ClinicRole.CLINIC_ADMIN
    )
  )
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return EncounterService.getById(id, req);
  }

  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.RECEPTIONIST, ClinicRole.NURSE))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateEncounterDto
  ): Promise<any> {
    return EncounterService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public update(
    @Path() id: string,
    @Body() body: UpdateEncounterDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return EncounterService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return EncounterService.remove(id, req);
  }

  @Put("/{id}/check-in")
  @Middlewares(checkClinicRole(ClinicRole.RECEPTIONIST))
  public checkIn(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return EncounterService.checkIn(id, req);
  }

  @Put("/{id}/complete")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public complete(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return EncounterService.complete(id, req);
  }

  @Put("/{id}/cancel")
  @Middlewares(
    checkClinicRole(ClinicRole.RECEPTIONIST, ClinicRole.CLINIC_ADMIN)
  )
  public cancel(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return EncounterService.cancel(id, req);
  }

  @Put("/{id}/no-show")
  @Middlewares(checkClinicRole(ClinicRole.RECEPTIONIST))
  public noShow(
    @Path() id: string,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return EncounterService.noShow(id, req);
  }

  @Get("/patient/{patientId}/history")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR, ClinicRole.NURSE))
  public patientHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ): Promise<any> {
    return EncounterService.getPatientHistory(patientId, req, page, limit);
  }
}
