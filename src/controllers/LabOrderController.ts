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
import { LabOrderService } from "../services/LabOrderService";
import { OrderStatus1 } from "../utils/interfaces/common";
import { checkClinicRole } from "../middlewares";
import { ClinicRole } from "../utils/roles";

@Tags("Lab Orders")
@Route("api/lab-orders")
@Security("jwt")
export class LabOrderController extends Controller {
  @Get("/")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR, ClinicRole.LAB_TECH))
  public list(
    @Request() req: ExpressRequest,
    @Query() page?: number,
    @Query() limit?: number
  ) {
    const {
      patientId,
      providerId,
      encounterId,
      status,
      testCategory,
      startDate,
      endDate,
    } = req.query;
    return LabOrderService.list(req, page, limit, {
      patientId: patientId as string,
      providerId: providerId as string,
      encounterId: encounterId as string,
      status: status as OrderStatus1,
      testCategory: testCategory as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
  }

  @Get("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR, ClinicRole.LAB_TECH))
  public get(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.getById(id, req);
  }

  @Post("/")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public create(@Request() req: ExpressRequest, @Body() body: any) {
    return LabOrderService.create(req, body);
  }

  @Put("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH))
  public update(
    @Path() id: string,
    @Body() body: any,
    @Request() req: ExpressRequest
  ) {
    return LabOrderService.update(id, body, req);
  }

  @Delete("/{id}")
  @Middlewares(checkClinicRole(ClinicRole.CLINIC_ADMIN))
  public remove(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.remove(id, req);
  }

  @Post("/{id}/collect-sample")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH))
  public collectSample(
    @Path() id: string,
    @Body() body: { sampleType: string },
    @Request() req: ExpressRequest
  ) {
    return LabOrderService.collectSample(id, body.sampleType, req);
  }

  @Put("/{id}/cancel")
  @Middlewares(checkClinicRole(ClinicRole.DOCTOR))
  public cancel(@Path() id: string, @Request() req: ExpressRequest) {
    return LabOrderService.cancel(id, req);
  }

  @Get("/pending")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH))
  public pendingRequests(@Request() req: ExpressRequest) {
    return LabOrderService.getPendingRequests(req);
  }

  @Get("/in-progress")
  @Middlewares(checkClinicRole(ClinicRole.LAB_TECH))
  public inProgressRequests(@Request() req: ExpressRequest) {
    return LabOrderService.getInProgressRequests(req);
  }
}
