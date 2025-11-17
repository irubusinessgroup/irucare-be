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
import { EMRService } from "../services/EMRService";
import type { CreateEMRDto, UpdateEMRDto } from "../utils/interfaces/common";
import type { EMRRecordType } from "../utils/interfaces/common";

@Tags("EMR")
@Route("api/emr")
@Security("jwt")
export class EMRController extends Controller {
  @Get("/")
  public list(@Request() req: ExpressRequest) {
    const { page, limit, patientId, encounterId, recordType, start, end } =
      req.query;
    return EMRService.list(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      {
        patientId: patientId as string | undefined,
        encounterId: encounterId as string | undefined,
        recordType: recordType as string | undefined as
          | EMRRecordType
          | undefined,
        start: start as string | undefined,
        end: end as string | undefined,
      },
    );
  }

  @Get("/{id}")
  public get(id: string) {
    return EMRService.getById(id);
  }

  @Get("/patient/{patientId}")
  public byPatient(patientId: string, @Request() req: ExpressRequest) {
    const { page, limit } = req.query;
    return EMRService.listByPatient(
      patientId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Get("/encounter/{encounterId}")
  public byEncounter(encounterId: string, @Request() req: ExpressRequest) {
    const { page, limit } = req.query;
    return EMRService.listByEncounter(
      encounterId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Get("/timeline/{patientId}")
  public timeline(patientId: string) {
    return EMRService.timeline(patientId);
  }

  @Post("/")
  public create(@Request() req: ExpressRequest, @Body() body: CreateEMRDto) {
    return EMRService.create(req, body);
  }

  @Put("/{id}")
  public update(id: string, @Body() body: UpdateEMRDto) {
    return EMRService.update(id, body);
  }

  @Delete("/{id}")
  public remove(id: string) {
    return EMRService.remove(id);
  }
}
