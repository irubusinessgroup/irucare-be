import {
  Body,
  Controller,
  Delete,
  Get,
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

@Tags("Encounters")
@Route("api/encounters")
@Security("jwt")
export class EncounterController extends Controller {
  @Get("/")
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
  public get(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return EncounterService.getById(id, req);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateEncounterDto
  ): Promise<any> {
    return EncounterService.create(req, body);
  }

  @Put("/{id}")
  public update(
    @Path() id: string,
    @Body() body: UpdateEncounterDto,
    @Request() req: ExpressRequest
  ): Promise<any> {
    return EncounterService.update(id, body, req);
  }

  @Delete("/{id}")
  public remove(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return EncounterService.remove(id, req);
  }

  @Put("/{id}/check-in")
  public checkIn(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return EncounterService.checkIn(id, req);
  }

  @Put("/{id}/complete")
  public complete(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return EncounterService.complete(id, req);
  }

  @Put("/{id}/cancel")
  public cancel(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return EncounterService.cancel(id, req);
  }

  @Put("/{id}/no-show")
  public noShow(@Path() id: string, @Request() req: ExpressRequest): Promise<any> {
    return EncounterService.noShow(id, req);
  }

  @Get("/patient/{patientId}/history")
  public patientHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ): Promise<any> {
    return EncounterService.getPatientHistory(patientId, req, page, limit);
  }
}
