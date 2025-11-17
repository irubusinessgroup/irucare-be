import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { EncounterService } from "../services/EncounterService";
import type {
  CreateEncounterDto,
  UpdateEncounterDto,
} from "../utils/interfaces/common";
import type { EncounterStatus } from "../services/EncounterService";

@Tags("Encounters")
@Route("api/encounters")
@Security("jwt")
export class EncounterController extends Controller {
  @Get("/")
  public list(@Request() req: ExpressRequest) {
    const {
      page,
      limit,
      patientId,
      providerId,
      appointmentId,
      status,
      start,
      end,
    } = req.query;
    return EncounterService.list(
      req,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        patientId: patientId as string | undefined,
        providerId: providerId as string | undefined,
        appointmentId: appointmentId as string | undefined,
        status: status as string | undefined as EncounterStatus | undefined,
        start: start as string | undefined,
        end: end as string | undefined,
      },
    );
  }

  @Get("/{id}")
  public get(id: string) {
    return EncounterService.getById(id);
  }

  @Post("/")
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateEncounterDto,
  ) {
    return EncounterService.create(req, body);
  }

  @Put("/{id}")
  public update(id: string, @Body() body: UpdateEncounterDto) {
    return EncounterService.update(id, body);
  }

  @Delete("/{id}")
  public remove(id: string) {
    return EncounterService.remove(id);
  }

  @Put("/{id}/complete")
  public complete(id: string) {
    return EncounterService.complete(id);
  }

  @Put("/{id}/cancel")
  public cancel(id: string) {
    return EncounterService.cancel(id);
  }
}
