import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  Route,
  Security,
  Tags,
  Path,
  Query,
  Delete,
  Put,
  Middlewares,
} from "tsoa";
import type { Request as ExpressRequest } from "express";
import { LabResultService } from "../services/LabResultService";
import {
  BulkCreateResultsDto,
  CreateLabResultDto,
  UpdateLabResultDto,
} from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Lab Results")
@Route("api/lab-results")
@Security("jwt")
export class LabResultController extends Controller {
  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH))
  public create(
    @Request() req: ExpressRequest,
    @Body() body: CreateLabResultDto,
  ): Promise<any> {
    return LabResultService.create(req, body);
  }

  @Post("/bulk")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH))
  public bulkCreate(
    @Request() req: ExpressRequest,
    @Body() body: BulkCreateResultsDto,
  ): Promise<any> {
    return LabResultService.bulkCreate(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH))
  public update(
    @Path() id: string,
    @Body() body: UpdateLabResultDto,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return LabResultService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public remove(
    @Path() id: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return LabResultService.remove(id, req);
  }

  @Get("/lab-order/{labOrderId}")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH, ClinicRole.PROVIDER))
  public getByLabOrder(
    @Path() labOrderId: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return LabResultService.getByLabOrderId(labOrderId, req);
  }

  @Post("/lab-order/{labOrderId}/approve")
  @Middlewares(checkClinicRole(ClinicRole.PROVIDER))
  public approve(
    @Path() labOrderId: string,
    @Request() req: ExpressRequest,
  ): Promise<any> {
    return LabResultService.approve(labOrderId, req);
  }

  @Get("/patient/{patientId}/history")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH, ClinicRole.PROVIDER))
  public patientHistory(
    @Path() patientId: string,
    @Request() req: ExpressRequest,
    @Query() testParameter?: string,
  ): Promise<any> {
    return LabResultService.getPatientHistory(patientId, req, testParameter);
  }
}
